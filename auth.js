// ============================================================
// auth.js — Align Auth & Social (No CDN — uses Supabase REST API)
// ============================================================

const SUPABASE_URL = 'https://qcfykavmohfstvxuawxc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zlpNinN6dNj2xC4vSB_HIA_7Ymi-v6o';
const REST_URL = `${SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

let _session = null;         // { access_token, refresh_token, user }
let currentUser = null;
let currentProfile = null;
let _realtimeWs = null;

// ---- Session helpers -------------------------------------------

function _saveSession(s) {
    _session = s;
    if (s) localStorage.setItem('align_session', JSON.stringify(s));
    else localStorage.removeItem('align_session');
}

function _loadSession() {
    try { _session = JSON.parse(localStorage.getItem('align_session')) || null; }
    catch { _session = null; }
    return _session;
}

function _authHeaders(extra = {}) {
    const h = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY };
    if (_session?.access_token) h['Authorization'] = `Bearer ${_session.access_token}`;
    return { ...h, ...extra };
}

// ---- Generic REST helpers --------------------------------------

async function _get(path, params = {}) {
    const url = new URL(REST_URL + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url, { headers: _authHeaders({ 'Accept': 'application/json' }) });
    return r.json();
}

async function _post(path, body, isAuth = false) {
    const base = isAuth ? AUTH_URL : REST_URL;
    const r = await fetch(base + path, {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.message || JSON.stringify(data));
    return data;
}

async function _patch(path, body, match = '') {
    const url = REST_URL + path + (match ? '?' + match : '');
    const r = await fetch(url, {
        method: 'PATCH',
        headers: _authHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify(body)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'PATCH failed'); }
}

async function _upsert(path, body, prefer = 'resolution=merge-duplicates') {
    const r = await fetch(REST_URL + path, {
        method: 'POST',
        headers: _authHeaders({ 'Prefer': `return=minimal,${prefer}` }),
        body: JSON.stringify(body)
    });
    // 201/200/204 all OK; ignore body on upsert
    return r;
}

async function _delete(path, match = '') {
    const url = REST_URL + path + (match ? '?' + match : '');
    await fetch(url, { method: 'DELETE', headers: _authHeaders() });
}

// ---- Init (no-op — no CDN needed) ----------------------------

function initSupabase() { return true; }

// ---- Auth -----------------------------------------------------

async function signUp(email, password, username) {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) throw new Error('Username must be ≥ 3 chars (letters, numbers, _).');

    // Check uniqueness via REST (public RLS allows SELECT on profiles)
    const existing = await _get('/profiles', { username: `eq.${clean}`, select: 'id' });
    if (existing?.length) throw new Error('Username already taken. Try another.');

    // Create auth user
    const r = await fetch(AUTH_URL + '/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ email, password })
    });
    const data = await r.json();

    // Handle rate limit & other errors
    if (!r.ok || data.error_code || data.code === 429) {
        throw new Error(data.msg || data.error_description || data.message || 'Sign-up failed. Try again later.');
    }

    // Supabase returns user in different places depending on email confirmation setting
    const user = data.user || data;
    const uid = user.id || user.user?.id;
    if (!uid) throw new Error('Sign-up succeeded but no user ID returned. Try signing in.');

    // Save session if we got tokens (auto-confirmed), otherwise skip
    if (data.access_token) {
        _saveSession(data);
        currentUser = user;
    } else {
        // email confirmation is ON — session comes after confirming
        _saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user });
        currentUser = user;
    }

    // Insert profile row
    const colors = ['#6c5ce7', '#00cec9', '#e17055', '#fdcb6e', '#55efc4', '#fd79a8'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    await fetch(REST_URL + '/profiles', {
        method: 'POST',
        headers: _authHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ id: uid, username: clean, display_name: username.trim(), avatar_color: color })
    });

    return data;
}

async function signIn(email, password) {
    const data = await _post('/token?grant_type=password', { email, password }, true);
    _saveSession(data);
    currentUser = data.user;
    return data;
}

async function signOut() {
    if (_session?.access_token) {
        await fetch(AUTH_URL + '/logout', {
            method: 'POST', headers: _authHeaders()
        }).catch(() => { });
    }
    _saveSession(null);
    currentUser = null;
    currentProfile = null;
    if (_realtimeWs) { _realtimeWs.close(); _realtimeWs = null; }
    window.dispatchEvent(new CustomEvent('align:signout'));
}

async function loadCurrentProfile() {
    _loadSession();
    if (!_session?.access_token) return null;

    // Verify token & get user
    const r = await fetch(AUTH_URL + '/user', { headers: _authHeaders() });
    if (!r.ok) { _saveSession(null); return null; }
    currentUser = await r.json();

    // Load profile row
    const rows = await _get('/profiles', { id: `eq.${currentUser.id}`, select: '*' });
    currentProfile = rows?.[0] || null;
    return currentProfile;
}

function getProfile() { return currentProfile; }
function getAuthUser() { return currentUser; }
function isLoggedIn() { return !!(_session?.access_token && currentUser); }

// ---- Task Cloud Sync ------------------------------------------

async function migrateLocalStorageToCloud() {
    const local = JSON.parse(localStorage.getItem('aesthetic_todos_v2')) || [];
    if (!local.length || !currentProfile) return;

    const existing = await _get('/tasks', { user_id: `eq.${currentProfile.id}`, select: 'id', limit: 1 });
    if (existing?.length) return; // already migrated

    const rows = local.map(t => ({
        id: t.id,
        user_id: currentProfile.id,
        text: t.text,
        category: t.category || 'Personal',
        priority: t.priority || 'None',
        completed: t.completed || false,
        created_at: t.createdAt || new Date().toISOString(),
        completed_at: t.completedAt || null
    }));
    await _upsert('/tasks', rows);
}

async function loadTasksFromCloud() {
    if (!currentProfile) return null;
    const data = await _get('/tasks', { user_id: `eq.${currentProfile.id}`, select: '*', order: 'created_at.desc' });
    if (!Array.isArray(data)) return null;
    return data.map(t => ({
        id: t.id, text: t.text, category: t.category, priority: t.priority,
        completed: t.completed, createdAt: t.created_at, completedAt: t.completed_at
    }));
}

async function syncTaskToCloud(todo) {
    if (!currentProfile) return;
    const row = [{
        id: todo.id,
        user_id: currentProfile.id,
        text: todo.text,
        category: todo.category || 'Personal',
        priority: todo.priority || 'None',
        completed: todo.completed || false,
        created_at: todo.createdAt || new Date().toISOString(),
        completed_at: todo.completedAt || null
    }];
    await _upsert('/tasks', row);
}

async function deleteTaskFromCloud(taskId) {
    if (!currentProfile) return;
    await _delete(`/tasks`, `id=eq.${taskId}&user_id=eq.${currentProfile.id}`);
}

async function syncDailyStats() {
    if (!currentProfile) return;
    const today = new Date().toISOString().split('T')[0];
    const history = JSON.parse(localStorage.getItem('aesthetic_history_v2')) || {};
    const flow = JSON.parse(localStorage.getItem('aesthetic_flow_v2')) || {};
    await _upsert('/daily_stats', [{
        user_id: currentProfile.id,
        date: today,
        completions: history[today] || 0,
        flow_seconds: flow[today] || 0
    }], 'resolution=merge-duplicates');
}

// ---- Friend System --------------------------------------------

async function searchUserByUsername(query) {
    const q = query.trim().toLowerCase();
    if (!q || !currentProfile) return [];
    const data = await _get('/profiles', {
        username: `ilike.*${q}*`,
        id: `neq.${currentProfile.id}`,
        select: 'id,username,display_name,avatar_color',
        limit: 10
    });
    return data || [];
}

async function sendFriendRequest(addresseeId) {
    const r = await fetch(REST_URL + '/friendships', {
        method: 'POST',
        headers: _authHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ requester_id: currentProfile.id, addressee_id: addresseeId, status: 'pending' })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Could not send request'); }
}

async function acceptFriendRequest(friendshipId) {
    await _patch(`/friendships`, { status: 'accepted' }, `id=eq.${friendshipId}&addressee_id=eq.${currentProfile.id}`);
}

async function declineFriendRequest(friendshipId) {
    await _patch(`/friendships`, { status: 'declined' }, `id=eq.${friendshipId}&addressee_id=eq.${currentProfile.id}`);
}

async function removeFriend(friendshipId) {
    await _delete(`/friendships`, `id=eq.${friendshipId}`);
}

async function _enrichFriendships(data) {
    return Promise.all((data || []).map(async f => {
        const friendId = f.requester_id === currentProfile.id ? f.addressee_id : f.requester_id;
        const rows = await _get('/profiles', { id: `eq.${friendId}`, select: 'id,username,display_name,avatar_color' });
        return { ...f, profile: rows?.[0] || null };
    }));
}

async function getFriends() {
    if (!currentProfile) return [];
    const data = await _get('/friendships', {
        or: `(requester_id.eq.${currentProfile.id},addressee_id.eq.${currentProfile.id})`,
        status: 'eq.accepted',
        select: 'id,requester_id,addressee_id,status,created_at'
    });
    return _enrichFriendships(data);
}

async function getPendingRequests() {
    if (!currentProfile) return [];
    const data = await _get('/friendships', {
        addressee_id: `eq.${currentProfile.id}`,
        status: 'eq.pending',
        select: 'id,requester_id,status,created_at'
    });
    return Promise.all((data || []).map(async f => {
        const rows = await _get('/profiles', { id: `eq.${f.requester_id}`, select: 'id,username,display_name,avatar_color' });
        return { ...f, profile: rows?.[0] || null };
    }));
}

async function getSentPendingRequests() {
    if (!currentProfile) return [];
    const data = await _get('/friendships', {
        requester_id: `eq.${currentProfile.id}`,
        status: 'eq.pending',
        select: 'addressee_id'
    });
    return (data || []).map(r => r.addressee_id);
}

// ---- Friend Stats & Accountability ----------------------------

async function getFriendStats(friendId) {
    const today = new Date().toISOString().split('T')[0];
    const tasks = await _get('/tasks', { user_id: `eq.${friendId}`, select: 'id,completed,created_at,completed_at' });
    const total = (tasks || []).length;
    const done = (tasks || []).filter(t => t.completed).length;

    const stats = await _get('/daily_stats', {
        user_id: `eq.${friendId}`, select: 'date,completions,flow_seconds',
        order: 'date.desc', limit: 30
    });
    const map = {};
    (stats || []).forEach(s => { map[s.date] = s; });

    let streak = 0; let d = new Date();
    while (true) {
        const ds = d.toISOString().split('T')[0];
        if (map[ds]?.completions > 0) { streak++; d.setDate(d.getDate() - 1); }
        else if (streak === 0 && ds === today) d.setDate(d.getDate() - 1);
        else break;
    }
    return { total, done, streak, todayCompletions: map[today]?.completions || 0, todayFlow: map[today]?.flow_seconds || 0 };
}

async function getLeaderboard() {
    const friends = await getFriends();
    const friendIds = friends.map(f => f.profile?.id).filter(Boolean);
    friendIds.push(currentProfile.id);

    const since = new Date(); since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().split('T')[0];

    const stats = await _get('/daily_stats', {
        user_id: `in.(${friendIds.join(',')})`,
        date: `gte.${sinceStr}`,
        select: 'user_id,completions,flow_seconds,date'
    });
    const totals = {};
    friendIds.forEach(id => { totals[id] = { completions: 0, flow: 0 }; });
    (stats || []).forEach(s => {
        if (totals[s.user_id]) { totals[s.user_id].completions += s.completions; totals[s.user_id].flow += s.flow_seconds; }
    });
    const rows = friendIds.map(id => {
        let profile = (id === currentProfile.id) ? currentProfile : friends.find(f => f.profile?.id === id)?.profile;
        return {
            id,
            username: profile?.username || '?',
            display_name: profile?.display_name || profile?.username || '?',
            avatar_color: profile?.avatar_color || '#6c5ce7',
            isSelf: id === currentProfile.id,
            completions: totals[id]?.completions || 0,
            flow: totals[id]?.flow || 0
        };
    });
    rows.sort((a, b) => b.completions - a.completions || b.flow - a.flow);
    return rows;
}

// ---- Realtime (polling fallback — no CDN required) ------------

function subscribeToFriendships(onUpdate) {
    // Poll every 15s for new friend requests (no websocket CDN needed)
    if (_realtimeWs) clearInterval(_realtimeWs);
    _realtimeWs = setInterval(onUpdate, 15000);
}

// ---- Helpers --------------------------------------------------

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatFlowTime(s) {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ---- Profile Editing --------------------------------------------
async function updateProfile(updates) {
    if (!currentProfile) throw new Error('Not logged in');

    // Only allow updating display_name, avatar_color, username
    const allowed = ['display_name', 'avatar_color', 'username'];
    const body = {};
    for (const key of allowed) {
        if (updates[key] !== undefined) body[key] = updates[key];
    }
    if (Object.keys(body).length === 0) return currentProfile;

    // Optional: add validation for username (e.g. check uniqueness)
    if (body.username) {
        const clean = body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (clean.length < 3) throw new Error('Username must be ≥ 3 chars.');
        // If it's the exact same, no need to update
        if (clean === currentProfile.username) {
            delete body.username;
        } else {
            body.username = clean;
            const existing = await _get('/profiles', { username: `eq.${clean}`, select: 'id' });
            if (existing?.length) throw new Error('Username already taken. Try another.');
        }
    }

    if (Object.keys(body).length === 0) return currentProfile;

    const data = await _patch('/profiles', body, `id=eq.${currentProfile.id}`);
    if (data && data.length > 0) {
        currentProfile = { ...currentProfile, ...body };
        return currentProfile;
    }
    throw new Error('Failed to update profile');
}

// ---- Expose ---------------------------------------------------
window.AlignAuth = {
    initSupabase, signUp, signIn, signOut,
    loadCurrentProfile, getProfile, getAuthUser, isLoggedIn,
    migrateLocalStorageToCloud, loadTasksFromCloud, syncTaskToCloud,
    deleteTaskFromCloud, syncDailyStats,
    searchUserByUsername, sendFriendRequest, acceptFriendRequest,
    declineFriendRequest, removeFriend, getFriends,
    getPendingRequests, getSentPendingRequests,
    getFriendStats, getLeaderboard,
    subscribeToFriendships,
    getInitials, formatFlowTime, updateProfile
};
