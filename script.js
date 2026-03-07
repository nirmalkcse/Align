document.addEventListener('DOMContentLoaded', () => {

    // ---- Audio Engine (Tactile UI Sounds) ----
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let sfxEnabled = true; // Still true by default

    function playSound(type) {
        if (!sfxEnabled || audioContext.state === 'suspended') return;

        // User requested: Remove sound from all elements except the Pomodoro timer
        if (type !== 'tick' && type !== 'bell') return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const now = audioContext.currentTime;

        if (type === 'tick') {
            // Very soft, muted droplet tick
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.015);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.02, now + 0.002);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
            oscillator.start(now);
            oscillator.stop(now + 0.03);
        } else if (type === 'bell') {
            // Resonant completion bell
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, now);

            const osc2 = audioContext.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1600, now);

            osc2.connect(gainNode);

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

            oscillator.start(now);
            osc2.start(now);
            oscillator.stop(now + 2.1);
            osc2.stop(now + 2.1);
        }
    }

    // Initialize audio context on first user interaction
    document.addEventListener('click', () => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }, { once: true });

    // ---- Brain Dump Sidebar ----
    const notesPanel = document.getElementById('notes-panel');
    const notesToggleBtn = document.getElementById('notes-toggle');
    const closeNotesBtn = document.getElementById('close-notes');
    const quickNotesInput = document.getElementById('quick-notes-input');

    // Restore saved notes
    if (quickNotesInput) {
        quickNotesInput.value = localStorage.getItem('aesthetic_brain_dump') || '';
        quickNotesInput.addEventListener('input', () => {
            localStorage.setItem('aesthetic_brain_dump', quickNotesInput.value);
        });
    }

    let isNotesPanelOpen = false;

    function openNotes() {
        notesPanel.classList.add('open');
        notesToggleBtn.classList.add('active');
        isNotesPanelOpen = true;
        playSound('heavy-click');
        setTimeout(() => quickNotesInput && quickNotesInput.focus(), 400);
    }

    function closeNotes() {
        notesPanel.classList.remove('open');
        notesToggleBtn.classList.remove('active');
        isNotesPanelOpen = false;
        playSound('heavy-click');
    }

    if (notesToggleBtn) {
        notesToggleBtn.addEventListener('click', () => {
            if (audioContext.state === 'suspended') audioContext.resume();
            isNotesPanelOpen ? closeNotes() : openNotes();
        });
    }

    if (closeNotesBtn) {
        closeNotesBtn.addEventListener('click', closeNotes);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isNotesPanelOpen) closeNotes();
    });



    // ---- Container Glow Tracking Effect ----
    const trackerContainer = document.querySelector('.tracker-container');
    const glow = document.getElementById('tracker-glow');
    trackerContainer.addEventListener('mousemove', (e) => {
        const rect = trackerContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        glow.style.setProperty('--mouse-x', `${x}px`);
        glow.style.setProperty('--mouse-y', `${y}px`);
    });

    // ---- Parallax Effect & Scroll Reveal ----
    const heroTitle = document.querySelector('.hero-title');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const utilityRow = document.querySelector('.utility-row'); // New utility block

    window.addEventListener('scroll', () => {
        let scrollY = window.scrollY;
        if (heroTitle && heroSubtitle) {
            heroTitle.style.transform = `translateY(${scrollY * -0.5}px)`;
            heroSubtitle.style.transform = `translateY(${scrollY * -0.1}px)`;
            if (utilityRow) utilityRow.style.transform = `translateY(${scrollY * -0.05}px)`; // Slower fade for utilities

            heroTitle.style.opacity = 1 - scrollY / 300;
            heroSubtitle.style.opacity = 1 - scrollY / 400;
            if (utilityRow) utilityRow.style.opacity = 1 - scrollY / 500;
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    if (trackerContainer) {
        observer.observe(trackerContainer);
    }

    // ---- Hero Utility Widget Logic ----

    // 1. Priority Target Widget
    function updatePriorityWidget() {
        const prioritySpan = document.getElementById('priority-target');
        if (!prioritySpan) return;

        const priorityTask = todos.find(t => !t.completed);
        if (priorityTask) {
            prioritySpan.textContent = priorityTask.text;
            prioritySpan.parentElement.parentElement.style.opacity = '1';
        } else {
            prioritySpan.textContent = 'All Done';
            prioritySpan.parentElement.parentElement.style.opacity = '0.5';
        }
    }

    window.startFocusOnPriority = function () {
        const priorityTask = todos.find(t => !t.completed);
        if (priorityTask) {
            setFocusTask(priorityTask.text);
        }
    };

    // 2. Streak Update
    function calculateStreak() {
        const streakSpan = document.getElementById('streak-data');
        if (!streakSpan) return;

        let streak = 0;
        let d = new Date();
        while (true) {
            const dateStr = d.toISOString().split('T')[0];
            if (appHistory[dateStr] && appHistory[dateStr] > 0) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else if (streak === 0 && d.toISOString().split('T')[0] === getTodayString()) {
                // If today has 0, check yesterday before breaking streak
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        streakSpan.textContent = `${streak} Day${streak !== 1 ? 's' : ''}`;

        const streakCard = streakSpan.closest('.utility-card');
        if (streak > 2) {
            streakCard.style.boxShadow = `0 15px 35px -10px rgba(108, 92, 231, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 20px rgba(108, 92, 231, 0.2)`;
        } else {
            streakCard.style.boxShadow = '';
        }
    }

    // 3. Deep Flow Today
    function updateFlowTimeWidget() {
        const flowSpan = document.getElementById('focus-time-data');
        if (!flowSpan) return;

        const today = getTodayString();
        let flowHistory = JSON.parse(localStorage.getItem('aesthetic_flow_v2')) || {};
        const flowSeconds = flowHistory[today] || 0;

        if (flowSeconds < 60) {
            flowSpan.textContent = `${flowSeconds}s`;
        } else if (flowSeconds < 3600) {
            flowSpan.textContent = `${Math.floor(flowSeconds / 60)}m`;
        } else {
            flowSpan.textContent = `${Math.floor(flowSeconds / 3600)}h ${Math.floor((flowSeconds % 3600) / 60)}m`;
        }
    }

    // Record Flow Time Hook
    window.addFocusSecond = function () {
        const today = getTodayString();
        let flowHistory = JSON.parse(localStorage.getItem('aesthetic_flow_v2')) || {};
        flowHistory[today] = (flowHistory[today] || 0) + 1;
        localStorage.setItem('aesthetic_flow_v2', JSON.stringify(flowHistory));
        updateFlowTimeWidget();
    };

    // ---- To-Do Logic & State ----
    let todos = JSON.parse(localStorage.getItem('aesthetic_todos_v2')) || [];
    let appHistory = JSON.parse(localStorage.getItem('aesthetic_history_v2')) || {};
    let currentFilter = 'All';

    // ---- Insight Engine ----
    function getTodayString() {
        return new Date().toISOString().split('T')[0];
    }

    function recordCompletion() {
        const today = getTodayString();
        appHistory[today] = (appHistory[today] || 0) + 1;
        localStorage.setItem('aesthetic_history_v2', JSON.stringify(appHistory));
    }

    function recordUncompletion() {
        const today = getTodayString();
        if (appHistory[today]) {
            appHistory[today] = Math.max(0, appHistory[today] - 1);
            localStorage.setItem('aesthetic_history_v2', JSON.stringify(appHistory));
        }
    }

    function updateInsights() {
        const subtitleEl = document.querySelector('.hero-subtitle');
        if (!subtitleEl) return;

        const totalCount = todos.length;
        const completeCount = todos.filter(t => t.completed).length;

        const today = getTodayString();
        const todayCompletions = appHistory[today] || 0;

        const days = Object.keys(appHistory);
        let average = 0;
        if (days.length > 0) {
            const totalCompletions = days.reduce((sum, day) => sum + appHistory[day], 0);
            average = +(totalCompletions / days.length).toFixed(1);
        }

        let insight = "Premium task management designed for absolute focus and intuitive control.";

        if (totalCount > 0 && completeCount === totalCount) {
            insight = `Absolute perfection. You've cleared your entire board today. Rest easy.`;
        } else if (todayCompletions > average && average > 0) {
            insight = `You're on fire. ${todayCompletions} tasks done today, beating your daily average of ${average}.`;
        } else if (todayCompletions >= 3) {
            insight = `Great momentum. You've crushed ${todayCompletions} tasks today. Keep it up.`;
        } else if (todayCompletions > 0) {
            insight = `Every step counts. You've completed ${todayCompletions} task${todayCompletions > 1 ? 's' : ''} today.`;
        } else if (totalCount > 0 && todayCompletions === 0) {
            insight = `You have ${totalCount} task${totalCount > 1 ? 's' : ''} waiting. Ready to drop into deep focus?`;
        }

        // Animated text swap
        if (subtitleEl.textContent !== insight) {
            subtitleEl.style.opacity = 0;
            subtitleEl.style.transform = 'translateY(10px)';
            setTimeout(() => {
                subtitleEl.textContent = insight;
                subtitleEl.style.opacity = 1;
                subtitleEl.style.transform = 'translateY(0)';
            }, 400);
        }
    }

    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    const categorySelect = document.getElementById('todo-category');
    const prioritySelect = document.getElementById('todo-priority');
    const todoList = document.getElementById('todo-list');
    const taskCount = document.getElementById('task-count');
    const clearCompletedBtn = document.getElementById('clear-completed');
    const exportCsvBtn = document.getElementById('export-csv');
    const emptyState = document.getElementById('empty-state');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const completionBar = document.getElementById('completion-bar');

    // Drag and Drop ordering
    new Sortable(todoList, {
        animation: 350,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onEnd: function (evt) {
            const newOrderIds = Array.from(todoList.children).map(li => parseInt(li.dataset.id));
            const reorderedTodos = [];
            newOrderIds.forEach(id => {
                const item = todos.find(t => t.id === id);
                if (item) reorderedTodos.push(item);
            });
            todos.forEach(t => {
                if (!reorderedTodos.find(rt => rt.id === t.id)) reorderedTodos.push(t);
            });
            todos = reorderedTodos;
            saveTodos();
        },
    });

    function saveTodos() {
        localStorage.setItem('aesthetic_todos_v2', JSON.stringify(todos));
        updateStats();
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function renderTodos() {
        todoList.innerHTML = '';

        const filteredTodos = todos.filter(t => {
            if (currentFilter === 'All') return true;
            return t.category === currentFilter;
        });

        if (filteredTodos.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            filteredTodos.forEach((todo, index) => {
                const li = document.createElement('li');
                li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
                li.style.animationDelay = `${index * 0.08}s`;
                li.dataset.id = todo.id;
                li.dataset.category = todo.category || 'Personal';

                li.innerHTML = `
                    <div class="cat-tag"></div>
                    <label class="checkbox-container" aria-label="${todo.completed ? 'Mark as incomplete' : 'Mark as complete'}">
                        <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo(${todo.id})">
                        <span class="checkmark"></span>
                    </label>
                    <div class="todo-content">
                        <span class="todo-text">${escapeHTML(todo.text)}</span>
                        <div class="todo-meta">
                            <span class="category-pill" onclick="cycleCategory(${todo.id})" title="Click to change category">${li.dataset.category}</span> &bull; <span>${formatDate(todo.createdAt)}</span>
                            ${todo.priority && todo.priority !== 'None' ? `<span class="priority-badge priority-${todo.priority.toLowerCase()}" onclick="cyclePriority(${todo.id})" title="Click to change priority">${todo.priority}</span>` : `<span class="priority-badge priority-none" onclick="cyclePriority(${todo.id})" title="Click to set priority">+ Priority</span>`}
                            <button class="focus-item-btn" onclick="setFocusTask('${escapeHTML(todo.text)}')">Focus on this</button>
                        </div>
                    </div>
                    <button class="delete-btn" onclick="deleteTodo(${todo.id})" aria-label="Delete task">&times;</button>
                `;
                todoList.appendChild(li);
            });
        }
        updateStats();
    }

    function updateStats() {
        const totalCount = todos.length;
        const completeCount = todos.filter(t => t.completed).length;
        const activeCount = totalCount - completeCount;

        // Update Tracker Progress Bar
        if (totalCount === 0) {
            taskCount.textContent = `No tasks`;
            completionBar.style.width = '0%';
        } else {
            taskCount.textContent = `${activeCount} task${activeCount !== 1 ? 's' : ''} remaining`;
            const percentage = (completeCount / totalCount) * 100;
            completionBar.style.width = `${percentage}%`;
        }

        // Update Hero Productivity Widget
        const scoreDisplayEl = document.getElementById('daily-score');
        if (scoreDisplayEl) {
            if (totalCount === 0) {
                scoreDisplayEl.textContent = '0%';
            } else {
                const percentage = Math.round((completeCount / totalCount) * 100);
                scoreDisplayEl.textContent = `${percentage}%`;
            }
        }

        // Trigger Insight update
        updateInsights();
    }

    todoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = todoInput.value.trim();
        const category = categorySelect.value;

        if (text) {
            const newTodo = {
                id: Date.now(),
                text: text,
                category: category,
                priority: prioritySelect ? prioritySelect.value : 'None',
                completed: false,
                createdAt: new Date().toISOString()
            };
            todos.unshift(newTodo);

            if (currentFilter !== 'All' && currentFilter !== category) {
                currentFilter = 'All';
                filterBtns.forEach(b => b.classList.remove('active'));
                document.querySelector('.filter-btn[data-filter="All"]').classList.add('active');
            }

            saveTodos();
            renderTodos();
            todoInput.value = '';
            if (prioritySelect) prioritySelect.value = 'None';

            trackerContainer.classList.remove('pop-anim');
            void trackerContainer.offsetWidth; // trigger reflow
            trackerContainer.classList.add('pop-anim');
        }
    });

    window.toggleTodo = function (id) {
        const todo = todos.find(t => t.id === id);
        if (todo) {
            const wasCompleted = todo.completed;
            todo.completed = !todo.completed;
            saveTodos();

            if (todo.completed) {
                recordCompletion();
            } else if (wasCompleted) {
                recordUncompletion();
            }

            const li = document.querySelector(`.todo-item[data-id="${id}"]`);
            if (li) {
                if (todo.completed) {
                    li.classList.add('completed');
                    if (!wasCompleted) fireConfetti(li);
                } else {
                    li.classList.remove('completed');
                }
                updateStats();
            } else {
                renderTodos();
            }
        }
    };

    window.cycleCategory = function (id) {
        const categories = ['Work', 'Personal', 'Learning'];
        const todoIndex = todos.findIndex(t => t.id === id);
        if (todoIndex > -1) {
            const currentCat = todos[todoIndex].category || 'Personal';
            const nextIndex = (categories.indexOf(currentCat) + 1) % categories.length;
            const newCat = categories[nextIndex];
            todos[todoIndex].category = newCat;
            saveTodos();

            const li = document.querySelector(`.todo-item[data-id="${id}"]`);
            if (li) {
                // If we are filtering and it no longer matches, animate it out
                if (currentFilter !== 'All' && currentFilter !== newCat) {
                    li.style.animationDelay = '0s';
                    li.classList.add('removing');
                    setTimeout(() => renderTodos(), 400);
                } else {
                    li.dataset.category = newCat;
                    const catPill = li.querySelector('.category-pill');
                    if (catPill) catPill.textContent = newCat;
                }
            } else {
                renderTodos();
            }
        }
    };

    window.cyclePriority = function (id) {
        const priorities = ['None', 'Low', 'Medium', 'High'];
        const todoIndex = todos.findIndex(t => t.id === id);
        if (todoIndex > -1) {
            const current = todos[todoIndex].priority || 'None';
            const nextIndex = (priorities.indexOf(current) + 1) % priorities.length;
            const newPri = priorities[nextIndex];
            todos[todoIndex].priority = newPri;
            saveTodos();

            const li = document.querySelector(`.todo-item[data-id="${id}"]`);
            if (li) {
                const badge = li.querySelector('.priority-badge');
                if (badge) {
                    badge.className = `priority-badge priority-${newPri.toLowerCase()}`;
                    badge.textContent = newPri === 'None' ? '+ Priority' : newPri;
                }
            } else {
                renderTodos();
            }
        }
    };

    window.deleteTodo = function (id) {
        const itemIndex = todos.findIndex(t => t.id === id);
        if (itemIndex > -1) {
            const li = document.querySelector(`.todo-item[data-id="${id}"]`);
            if (li) {
                li.classList.add('removing');
                li.style.animationDelay = '0s';
                setTimeout(() => {
                    todos.splice(itemIndex, 1);
                    saveTodos();
                    renderTodos();
                }, 400);
            } else {
                todos.splice(itemIndex, 1);
                saveTodos();
                renderTodos();
            }
        }
    };

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTodos();
        });
    });

    clearCompletedBtn.addEventListener('click', () => {
        const completedOnly = todos.filter(t => t.completed);
        if (completedOnly.length > 0) {
            completedOnly.forEach(t => {
                const li = document.querySelector(`.todo-item[data-id="${t.id}"]`);
                if (li) {
                    li.style.animationDelay = '0s';
                    li.classList.add('removing');
                }
            });

            setTimeout(() => {
                todos = todos.filter(t => !t.completed);
                saveTodos();
                renderTodos();
            }, 400);
        }
    });

    const exportCsvLink = document.getElementById('export-csv');
    if (exportCsvLink) {
        exportCsvLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (todos.length === 0) return alert("No tasks to export!");

            let csvContent = "data:text/csv;charset=utf-8,ID,Task,Category,Status,Created At\n";
            todos.forEach(todo => {
                const safeText = todo.text.replace(/"/g, '""');
                const status = todo.completed ? "Completed" : "Pending";
                csvContent += `"${todo.id}","${safeText}","${todo.category || 'Personal'}","${status}","${todo.createdAt}"\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "Your-Align-Tasks.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const exportXlsxLink = document.getElementById('export-xlsx');
    if (exportXlsxLink) {
        exportXlsxLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (todos.length === 0) return alert("No tasks to export!");

            // Use SheetJS (XLSX) if available
            if (typeof XLSX !== 'undefined') {
                const data = [
                    ["ID", "Task", "Category", "Status", "Created At"] // Header row
                ];

                todos.forEach(todo => {
                    const status = todo.completed ? "Completed" : "Pending";
                    data.push([
                        todo.id,
                        todo.text,
                        todo.category || 'Personal',
                        status,
                        todo.createdAt
                    ]);
                });

                const ws = XLSX.utils.aoa_to_sheet(data);
                ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 25 }]; // Optional: set column widths
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Tasks");
                XLSX.writeFile(wb, "Your-Align-Tasks.xlsx");
            } else {
                alert("XLSX Export is initializing, please try again in a moment.");
            }
        });
    }

    // ---- Minimal Confetti System ----
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let particles = [];

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // Modified to allow passing coordinate overrides (for center of screen)
    function fireConfetti(element, overrideX = null, overrideY = null) {
        let x, y;
        if (overrideX !== null && overrideY !== null) {
            x = overrideX;
            y = overrideY;
        } else {
            const rect = element.getBoundingClientRect();
            x = rect.left + 30;
            y = rect.top + (rect.height / 2);
        }

        for (let i = 0; i < 70; i++) {
            particles.push({
                x: x, y: y,
                r: Math.random() * 5 + 2,
                dx: Math.random() * 12 - 6,
                dy: Math.random() * -12 - 2,
                color: ['#5e6ad2', '#2ed573', '#3dc1d3', '#ffffff'][Math.floor(Math.random() * 4)],
                life: 1
            });
        }
        if (particles.length <= 70) requestAnimationFrame(updateConfetti);
    }

    function updateConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life > 0 ? p.life : 0;
            ctx.fill();

            p.x += p.dx;
            p.y += p.dy;
            p.dy += 0.2; // gravity
            p.life -= 0.015; // fade slower
        }
        particles = particles.filter(p => p.life > 0);
        if (particles.length > 0) requestAnimationFrame(updateConfetti);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // ---- Deep Focus Mode Logic with Addictive V5 Interactivity ----
    let focusTimer;
    let timeRemaining = 25 * 60;
    let isTimerRunning = false;
    const TOTAL_TIME = 25 * 60;

    const focusBtn = document.getElementById('focus-toggle');
    const exitFocusBtn = document.getElementById('exit-focus');
    const focusOverlay = document.getElementById('focus-overlay');
    const startTimerBtn = document.getElementById('start-timer');
    const resetTimerBtn = document.getElementById('reset-timer');
    const timeDisplay = document.getElementById('time-display');
    const currentFocusTaskText = document.getElementById('current-focus-task');
    const circle = document.querySelector('.progress-ring__circle');
    const timerContainer = document.querySelector('.timer-container');

    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    function setProgress(percent) {
        const offset = circumference - percent / 100 * circumference;
        circle.style.strokeDashoffset = offset;
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function updateTimerUI() {
        timeDisplay.textContent = formatTime(timeRemaining);
        const percentage = ((TOTAL_TIME - timeRemaining) / TOTAL_TIME) * 100;
        setProgress(percentage);
    }

    function setupBreathing(state) {
        if (state) {
            circle.classList.add('breathing');
            timeDisplay.classList.add('breathing');
            timerContainer.classList.add('breathing');
        } else {
            circle.classList.remove('breathing');
            timeDisplay.classList.remove('breathing');
            timerContainer.classList.remove('breathing');
        }
    }

    focusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        playSound('heavy-click');
        timeRemaining = TOTAL_TIME;
        isTimerRunning = false;
        clearInterval(focusTimer);
        startTimerBtn.textContent = 'Start';
        setupBreathing(false);
        updateTimerUI();
        focusOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    exitFocusBtn.addEventListener('click', () => {
        playSound('uncheck');
        focusOverlay.classList.remove('active');
        document.body.style.overflow = '';
        clearInterval(focusTimer);
        isTimerRunning = false;
        setupBreathing(false);
    });

    window.setFocusTask = function (taskText) {
        playSound('heavy-click');
        currentFocusTaskText.textContent = `Focusing on: ${taskText}`;
        clearFocusBtn.style.display = 'inline-flex';
        focusOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    const clearFocusBtn = document.getElementById('clear-focus-task');
    if (clearFocusBtn) {
        clearFocusBtn.addEventListener('click', () => {
            playSound('uncheck');
            // Stop the timer
            clearInterval(focusTimer);
            isTimerRunning = false;
            setupBreathing(false);
            // Reset timer display
            timeRemaining = TOTAL_TIME;
            startTimerBtn.textContent = 'Start';
            updateTimerUI();
            // Clear the task label
            currentFocusTaskText.textContent = 'Select a task to focus on...';
            clearFocusBtn.style.display = 'none';
        });
    }


    // ---- In-overlay Task Picker ----
    const taskPicker = document.getElementById('task-picker');
    const taskPickerList = document.getElementById('task-picker-list');

    function openTaskPicker() {
        const incomplete = todos.filter(t => !t.completed);
        taskPickerList.innerHTML = '';

        if (incomplete.length === 0) {
            taskPickerList.innerHTML = '<li class="picker-empty">No incomplete tasks</li>';
        } else {
            incomplete.forEach(todo => {
                const li = document.createElement('li');
                li.className = 'picker-item';
                li.textContent = todo.text;
                if (todo.priority && todo.priority !== 'None') {
                    const badge = document.createElement('span');
                    badge.className = `picker-priority picker-priority-${todo.priority.toLowerCase()}`;
                    badge.textContent = todo.priority;
                    li.appendChild(badge);
                }
                li.addEventListener('click', () => {
                    playSound('heavy-click');
                    currentFocusTaskText.textContent = `Focusing on: ${todo.text}`;
                    currentFocusTaskText.classList.remove('clickable-task');
                    clearFocusBtn.style.display = 'inline-flex';
                    taskPicker.classList.remove('open');
                });
                taskPickerList.appendChild(li);
            });
        }
        taskPicker.classList.add('open');
    }

    currentFocusTaskText.addEventListener('click', () => {
        if (taskPicker.classList.contains('open')) {
            taskPicker.classList.remove('open');
        } else {
            openTaskPicker();
        }
    });

    // Close picker on clear
    const clearFocusBtnRef = document.getElementById('clear-focus-task');
    if (clearFocusBtnRef) {
        clearFocusBtnRef.addEventListener('click', () => {
            taskPicker.classList.remove('open');
            currentFocusTaskText.classList.add('clickable-task');
        });
    }

    startTimerBtn.addEventListener('click', () => {

        playSound('heavy-click');
        if (isTimerRunning) {
            clearInterval(focusTimer);
            startTimerBtn.textContent = 'Resume';
            isTimerRunning = false;
            setupBreathing(false);
        } else {
            startTimerBtn.textContent = 'Pause';
            isTimerRunning = true;
            setupBreathing(true);
            focusTimer = setInterval(() => {
                timeRemaining--;
                updateTimerUI();
                addFocusSecond(); // Track flow time dynamically
                playSound('tick'); // Satisfying metronome tick

                if (timeRemaining <= 0) {
                    clearInterval(focusTimer);
                    isTimerRunning = false;
                    startTimerBtn.textContent = 'Done!';
                    setupBreathing(false);
                    playSound('bell'); // Big completion chime
                    fireConfetti(null, window.innerWidth / 2, window.innerHeight / 2); // Center explosion
                }
            }, 1000);
        }
    });

    resetTimerBtn.addEventListener('click', () => {
        playSound('heavy-click');
        clearInterval(focusTimer);
        isTimerRunning = false;
        setupBreathing(false);
        startTimerBtn.textContent = 'Start';
        timeRemaining = TOTAL_TIME;
        updateTimerUI();
    });

    function escapeHTML(str) {
        let div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    // ---- Daily Essentials Habit Tracker ----
    // ---- Productivity Hub Utilities ----

    // 1. Deep Work State (120m)
    const deepworkBtn = document.getElementById('prod-deepwork-btn');
    if (deepworkBtn) {
        deepworkBtn.addEventListener('click', () => {
            setFocusTask("Deep Work Session");
            timeRemaining = 120 * 60; // 120 minutes
            updateTimerUI();
        });
    }

    // 2. Take a Break (15m)
    const breakBtn = document.getElementById('prod-break-btn');
    if (breakBtn) {
        breakBtn.addEventListener('click', () => {
            setFocusTask("Recovery Break");
            timeRemaining = 15 * 60; // 15 minutes
            updateTimerUI();
        });
    }

    // 3. Urgent Focus Filter
    const urgentBtn = document.getElementById('prod-urgent-btn');
    if (urgentBtn) {
        urgentBtn.addEventListener('click', () => {
            // Scroll to tracker
            document.getElementById('tracker').scrollIntoView({ behavior: 'smooth' });

            // Highlight High Priority tasks
            const taskItems = document.querySelectorAll('.todo-item');
            let found = false;
            taskItems.forEach(item => {
                const badge = item.querySelector('.priority-badge');
                if (badge && badge.textContent === 'High') {
                    found = true;
                    item.style.transform = 'scale(1.02)';
                    item.style.boxShadow = '0 0 15px rgba(225, 112, 85, 0.4)';
                    setTimeout(() => {
                        item.style.transform = '';
                        item.style.boxShadow = '';
                    }, 1500);
                }
            });
            if (!found) {
                // Flash the input to encourage adding one
                const input = document.getElementById('todo-input');
                input.placeholder = "No High priority tasks! Add one?";
                setTimeout(() => input.placeholder = "What needs to be done today?", 2000);
            }
        });
    }

    // 4. Surprise Me (Random Focus Task)
    const randomBtn = document.getElementById('prod-random-btn');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            const incompleteTasks = todos.filter(t => !t.completed);
            if (incompleteTasks.length === 0) {
                alert("You don't have any incomplete tasks! You're all caught up.");
                return;
            }
            // Pick a random task
            const randomTask = incompleteTasks[Math.floor(Math.random() * incompleteTasks.length)];

            // Set it as focus and start timer
            setFocusTask(randomTask.text);
            timeRemaining = 25 * 60; // Standard 25m Pomodoro
            updateTimerUI();
        });
    }

    // Initial render
    renderTodos();
    updateTimerUI();
});
