/**
 * MP ASCENSORES - LÓGICA DE SINCRONIZACIÓN CSV
 * Gestión de login y carga de datos con corrección de fechas estricta (RAW).
 */

// --- VARIABLES GLOBALES ---
let fullData = [];
let currentFilteredData = []; 
let currentSortOrder = 'id'; // 'id', 'date_desc', 'date_asc'
const THEME_KEY = 'mp_theme_preference';
let currentUser = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
});

function initEventListeners() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const loginBtn = document.getElementById('loginBtn');
    const loginInput = document.getElementById('loginId');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (loginInput) {
        loginInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm("¿Seguro que deseas cerrar sesión?")) {
                location.reload(); 
            }
        });
    }

    const resetBtn = document.getElementById('resetFilters');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.getElementById('dateStart').value = '';
            document.getElementById('dateEnd').value = '';
            document.getElementById('liftSearch').value = '';
            applyFilters();
            showToast("Filtros restablecidos", "info");
        });
    }

    ['dateStart', 'dateEnd', 'liftSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', applyFilters);
    });

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSortOrder = e.target.value;
            renderList(currentFilteredData);
        });
    }

    const toggleBtn = document.getElementById('toggleMenuBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const menu = document.getElementById('liftMenuContent');
            const chevron = document.getElementById('menuChevron');
            menu.classList.toggle('hidden');
            chevron.style.transform = menu.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById('view-detalle').classList.toggle('hidden', view !== 'detalle');
            document.getElementById('view-graficos').classList.toggle('hidden', view !== 'graficos');
            
            if (view === 'graficos' && typeof renderCharts === 'function') {
                setTimeout(() => renderCharts(currentFilteredData), 50);
            }
        });
    });
}

// --- UTILIDAD: LIMPIEZA DE CLAVES ---
function cleanRowKeys(row) {
    const newRow = {};
    Object.keys(row).forEach(key => {
        const cleanKey = key.trim().toUpperCase().replace(/[\uFEFF\s]/g, '');
        newRow[cleanKey] = row[key];
    });
    return newRow;
}

// --- PARSER DE FECHAS SEGURO ---
function safeDateFormatter(val) {
    if (!val) return "--/--/----";

    if (val instanceof Date) {
        const day = val.getDate().toString().padStart(2, '0');
        const month = (val.getMonth() + 1).toString().padStart(2, '0');
        const year = val.getFullYear();
        return `${day}/${month}/${year}`;
    }

    let str = String(val).trim();
    if (str.includes('/') || str.includes('-')) {
        return str; 
    }

    const n = parseFloat(str);
    if (!isNaN(n) && n > 20000) {
        const d = new Date(Math.round((n - 25569 + 0.5) * 86400 * 1000));
        const day = d.getUTCDate().toString().padStart(2, '0');
        const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }
    return str;
}

// --- PARSER FECHA INTERNO (PARA ORDENAR) ---
function parseDateString(s) {
    if (!s || s === "--/--/----") return null;
    const p = s.split(/[\/\-]/); 
    if (p.length !== 3) return null;
    return new Date(p[2], p[1] - 1, p[0]); 
}

// --- LÓGICA DE LOGIN ---
async function handleLogin() {
    const inputId = document.getElementById('loginId').value.trim().toUpperCase();
    const btn = document.getElementById('loginBtn');
    
    if (!inputId) {
        showToast("Introduce tu ID", "error");
        return;
    }

    btn.innerHTML = 'Verificando...';
    btn.disabled = true;

    try {
        if (typeof XLSX === 'undefined') throw new Error("Librería Excel no cargada.");

        const response = await fetch(`data/usuarios.csv?t=${Date.now()}`);
        if (!response.ok) throw new Error("No se encontró el archivo de usuarios.");
        
        const csvText = await response.text();
        const workbook = XLSX.read(csvText, { type: 'string', raw: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const usersRaw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const userRow = usersRaw.map(cleanRowKeys).find(u => String(u.ID).trim().toUpperCase() === inputId);

        if (userRow) {
            currentUser = {
                id: inputId,
                name: userRow.NOMBRE || "Usuario",
                role: userRow.ROL || "Técnico",
                access: (userRow.ACCESO || "ALL").toString().split(/[,;]/).map(s => s.trim())
            };

            document.getElementById('login-screen').classList.add('hidden');
            const loader = document.getElementById('loader-wrapper');
            if (loader) loader.classList.remove('hidden');
            
            runLoaderSimulation(() => {
                loadUserData(currentUser);
            });
        } else {
            throw new Error("ID no autorizado");
        }

    } catch (error) {
        console.error("Login Error:", error);
        showToast(error.message, "error");
        document.querySelector('.login-card')?.style.setProperty('animation', 'shake 0.5s');
    } finally {
        btn.innerHTML = 'Identificarse';
        btn.disabled = false;
    }
}

// --- CARGA DE DATOS ---
async function loadUserData(user) {
    const welcomeMsg = document.getElementById('user-welcome-msg');
    if (welcomeMsg) welcomeMsg.innerHTML = `Hola, <strong>${user.name}</strong>`;

    try {
        const fileUrl = `data/informes.csv?t=${Date.now()}`;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Error cargando informes.");
        
        const csvText = await response.text();
        const workbook = XLSX.read(csvText, { type: 'string', raw: true, cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rowsRaw = XLSX.utils.sheet_to_json(sheet, { defval: "" }); 
        
        const rows = rowsRaw.map(cleanRowKeys);
        let liftsMap = {};

        rows.forEach(row => {
            const idObra = row.IDOBRA || row.ID_OBRA || row.ID;
            if (!idObra) return;

            if (!liftsMap[idObra]) {
                liftsMap[idObra] = {
                    id: idObra,
                    name: row.NOMBREOBRA || row.NOMBRE_OBRA || row.NOMBRE || "Sin nombre",
                    dependency: row.DEPENDENCIA || row.DELEGACION || "Otras",
                    date: safeDateFormatter(row.FECHAPM || row.FECHA_PM || row.PUESTAENMARCHA),
                    averias: []
                };
            }

            const idAv = row.IDAVERIA || row.ID_AVERIA;
            if (idAv) {
                // Filtro Anti-Duplicados
                const exists = liftsMap[idObra].averias.some(a => String(a.id) === String(idAv));
                if (!exists) {
                    liftsMap[idObra].averias.push({
                        id: idAv,
                        desc: row.DESCAVERIA || row.DESC_AVERIA || row.DESCRIPCION || "",
                        date: safeDateFormatter(row.FECHAAVERIA || row.FECHA_AVERIA || row.FECHA),
                        category: row.CATEGORIA || "Otros"
                    });
                }
            }
        });

        const allLifts = Object.values(liftsMap);

        if (user.access.includes("ALL")) {
            fullData = allLifts;
        } else {
            fullData = allLifts.filter(lift => {
                const accessById = user.access.includes(lift.id);
                const accessByDep = user.access.some(acc => 
                    lift.dependency && lift.dependency.toUpperCase().includes(acc.toUpperCase())
                );
                return accessById || accessByDep;
            });
        }

        finalizeDataLoading();

    } catch (error) {
        console.error(error);
        showToast("Error procesando datos.", "error");
        document.getElementById('loader-wrapper')?.classList.add('hidden');
    }
}

function finalizeDataLoading() {
    currentFilteredData = [...fullData];
    
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('mainContent').classList.remove('hidden'); 
    
    const empty = fullData.length === 0;
    document.getElementById('emptyState').classList.toggle('hidden', !empty);
    if (empty) {
        document.getElementById('mainContent').classList.add('hidden');
        showToast("Sin datos para mostrar.", "info");
    } else {
        document.getElementById('emptyState').classList.add('hidden');
        renderList(currentFilteredData);
        updateStats();
        if (typeof renderCharts === 'function') renderCharts(currentFilteredData);
        showToast(`Datos cargados: ${fullData.length} instalaciones.`, "success");
    }
}

// --- FILTROS Y RENDERIZADO ---
function applyFilters() {
    const term = document.getElementById('liftSearch').value.toLowerCase();
    const startDate = document.getElementById('dateStart').value ? new Date(document.getElementById('dateStart').value) : null;
    const endDate = document.getElementById('dateEnd').value ? new Date(document.getElementById('dateEnd').value) : null;

    currentFilteredData = fullData.map(lift => {
        const filteredAverias = lift.averias.filter(av => {
            const avDate = parseDateString(av.date);
            if (!avDate) return true;
            if (startDate && avDate < startDate) return false;
            if (endDate && avDate > endDate) return false;
            return true;
        });
        return { ...lift, averias: filteredAverias };
    }).filter(lift => {
        const matchesName = lift.id.toLowerCase().includes(term) || 
                            lift.name.toLowerCase().includes(term) ||
                            (lift.dependency && lift.dependency.toLowerCase().includes(term));
        
        const matchesBreakdown = lift.averias.some(av => av.desc.toLowerCase().includes(term));
        
        return term === '' || matchesName || matchesBreakdown;
    });

    renderList(currentFilteredData);
    updateStats();
}

function renderList(data) {
    const list = document.getElementById('liftList');
    if(!list) return;
    list.innerHTML = '';
    
    if (data.length === 0) {
        list.innerHTML = `<div class="empty-list-state"><p>Sin resultados</p></div>`;
        return;
    }

    const grouped = data.reduce((acc, l) => {
        const dep = l.dependency || "Otras Delegaciones";
        if (!acc[dep]) acc[dep] = [];
        acc[dep].push(l);
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(dep => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'dependency-group';
        groupDiv.innerHTML = `
            <div class="dependency-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span>${dep}</span>
                <span class="badge-count">${grouped[dep].length}</span>
                <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
        `;
        
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'dependency-items';
        
        // ORDENAR
        const items = grouped[dep].sort((a, b) => {
            if (currentSortOrder === 'id') return a.id.localeCompare(b.id);
            const da = parseDateString(a.date) || new Date(0);
            const db = parseDateString(b.date) || new Date(0);
            return currentSortOrder === 'date_desc' ? db - da : da - db;
        });

        items.forEach(lift => {
            const itemDiv = document.createElement('div');
            const count = lift.averias.length;
            let statusClass = 'status-ok'; 
            if (count >= 5) statusClass = 'status-critical'; 
            else if (count >= 2) statusClass = 'status-warning'; 

            itemDiv.className = `list-item ${statusClass}`;
            itemDiv.innerHTML = `
                <div style="overflow: hidden; padding-right: 0.5rem;">
                    <span style="font-size:0.7rem; font-weight:bold; opacity:0.7;">${lift.id}</span>
                    <div style="font-size:0.85rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lift.name}</div>
                </div>
                <span class="list-badge">${count}</span>
            `;
            itemDiv.onclick = () => {
                document.querySelectorAll('.list-item').forEach(el => el.classList.remove('selected'));
                itemDiv.classList.add('selected');
                showDetail(lift);
                if(window.innerWidth <= 768) {
                    const menu = document.getElementById('liftMenuContent');
                    const chevron = document.getElementById('menuChevron');
                    if (menu) menu.classList.add('hidden');
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                }
            };
            itemsDiv.appendChild(itemDiv);
        });

        groupDiv.appendChild(itemsDiv);
        list.appendChild(groupDiv);
    });
}

function showDetail(lift) {
    document.getElementById('selectLiftPrompt').classList.add('hidden');
    const detail = document.getElementById('liftDetailView');
    detail.classList.remove('hidden');
    document.getElementById('detailId').innerText = lift.id;
    document.getElementById('detailName').innerText = lift.name;
    document.getElementById('detailDate').innerText = lift.date;
    
    const countEl = document.getElementById('detailCount');
    const bloqueEl = document.getElementById('statBloqueColor');
    countEl.innerText = lift.averias.length;
    
    bloqueEl.className = 'stat-bloque'; 
    if (lift.averias.length >= 5) bloqueEl.classList.add('bg-crit');
    else if (lift.averias.length >= 2) bloqueEl.classList.add('bg-warn');
    else bloqueEl.classList.add('bg-ok');

    if(typeof analyzeCommissioning === 'function') {
        const analysis = analyzeCommissioning(lift);
        const old = document.getElementById('dynamic-analysis');
        if(old) old.remove();

        if (analysis) {
            const analysisDiv = document.createElement('div');
            analysisDiv.id = 'dynamic-analysis';
            analysisDiv.className = `analysis-card ${analysis.cssClass}`;
            analysisDiv.innerHTML = `
                <div class="analysis-icon">${analysis.icon}</div>
                <div class="analysis-content">
                    <div class="analysis-title">Diagnóstico IA</div>
                    <div class="analysis-desc">${analysis.message}</div>
                    <div class="analysis-mini-charts">
                        <div class="mini-col" title="Mes 1"><span>M1</span><div style="height:${Math.min(analysis.buckets[0]*10, 30)}px"></div><small>${analysis.buckets[0]}</small></div>
                        <div class="mini-col" title="Mes 2"><span>M2</span><div style="height:${Math.min(analysis.buckets[1]*10, 30)}px"></div><small>${analysis.buckets[1]}</small></div>
                        <div class="mini-col" title="Mes 3+"><span>M3+</span><div style="height:${Math.min(analysis.buckets[2]*10, 30)}px"></div><small>${analysis.buckets[2]}</small></div>
                    </div>
                </div>
            `;
            const header = document.querySelector('.detail-header-modern');
            if(header) header.after(analysisDiv);
        }
    }

    // --- CÁLCULO FRECUENCIA (LOCAL RATIO) ---
    const now = new Date();
    const startDate = parseDateString(lift.date);
    // Calcular meses activos. Si no hay fecha, asumimos 1 para evitar división por 0.
    let monthsActive = 1; 
    if (startDate) {
        // Diferencia en meses
        monthsActive = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
        if (monthsActive < 1) monthsActive = 1; // Mínimo 1 mes
    }
    
    // Ratio = Averías / Meses activos
    const freq = (lift.averias.length / monthsActive).toFixed(2);
    document.getElementById('detailMtbf').innerText = freq;

    const container = document.getElementById('averiasContainer');
    
    if (lift.averias.length === 0) {
        container.innerHTML = `<div style="text-align: center; opacity: 0.5; font-style: italic; padding: 2rem;">Sin averías en este periodo</div>`;
    } else {
        const averiasOrdenadas = [...lift.averias].sort((a, b) => {
            const dateA = parseDateString(a.date) || new Date(0);
            const dateB = parseDateString(b.date) || new Date(0);
            return dateB - dateA;
        });

        container.innerHTML = averiasOrdenadas.map(av => `
            <div class="averia-card">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;">
                    <strong>#${av.id}</strong><span>${av.date}</span>
                </div>
                <p style="margin:0; font-size:0.9rem;">${av.desc}</p>
            </div>
        `).join('');
    }

    if (window.innerWidth <= 768) detail.scrollIntoView({ behavior: 'smooth' });
}

// --- UTILS & HELPERS ---
function runLoaderSimulation(onComplete) {
    const bar = document.getElementById('bar');
    const wrapper = document.getElementById('loader-wrapper');
    const textEl = document.getElementById('loaderText');
    
    if (!wrapper) { if(onComplete) onComplete(); return; } 
    if(!bar) { wrapper.classList.add('hidden'); if(onComplete) onComplete(); return; }

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress > 100) progress = 100;
        bar.style.width = `${progress}%`;

        if (textEl) {
            if (progress < 40) textEl.innerText = "Consultando base de datos...";
            else if (progress < 80) textEl.innerText = "Validando permisos de zona...";
            else textEl.innerText = "Sincronización completa.";
        }

        if (progress === 100) {
            clearInterval(interval);
            setTimeout(() => wrapper.classList.add('loaded'), 300);
            setTimeout(() => {
                wrapper.style.opacity = '0';
                setTimeout(() => {
                    wrapper.style.display = 'none';
                    if (onComplete) onComplete();
                }, 1000);
            }, 2000); 
        }
    }, 100);
}

function analyzeCommissioning(lift) {
    const startDate = parseDateString(lift.date);
    if (!startDate || lift.averias.length === 0) return null;
    const buckets = [0, 0, 0];
    lift.averias.forEach(av => {
        const avDate = parseDateString(av.date);
        if (!avDate) return;
        const diffDays = (avDate - startDate) / (1000 * 60 * 60 * 24);
        if (diffDays <= 30) buckets[0]++;
        else if (diffDays <= 60) buckets[1]++;
        else buckets[2]++;
    });
    const [m1, m2, m3] = buckets;
    let status = "NORMAL";
    let message = "Estabilización en proceso.";
    let icon = "🟢";
    let cssClass = "analysis-ok";

    if ((m3 > m1 && m3 > 0) || (m2 > m1 + 1)) {
        status = "CRÍTICO";
        message = "Tendencia ascendente. No estabiliza.";
        icon = "🔴";
        cssClass = "analysis-critical";
    } else if (lift.averias.length >= 6) {
        status = "SATURADO";
        message = "Volumen excesivo.";
        icon = "🟠";
        cssClass = "analysis-warning";
    } else if (m1 > 0 && m2 === 0 && m3 === 0) {
        status = "IDEAL";
        message = "Estabilización perfecta.";
        icon = "🔵";
        cssClass = "analysis-ideal";
    }
    return { buckets, status, message, icon, cssClass };
}

// --- ACTUALIZACIÓN DE ESTADÍSTICAS GLOBAL (RATIO) ---
function updateStats() {
    const totalAv = currentFilteredData.reduce((s,l) => s + l.averias.length, 0);
    const affectedLifts = currentFilteredData.filter(l => l.averias.length > 0).length;
    // Total de ascensores visibles en el filtro actual
    const totalLifts = currentFilteredData.length;
    
    // Ratio Global = Total Averías / Total Ascensores
    const globalRatio = totalLifts > 0 ? (totalAv / totalLifts).toFixed(2) : "0.00";

    document.getElementById('stat-averias').innerText = totalAv;
    document.getElementById('stat-lifts').innerText = affectedLifts; 
    // Usamos el ID stat-mtbf aunque ahora muestra el Ratio para no tocar HTML
    const mtbfEl = document.getElementById('stat-mtbf');
    if(mtbfEl) mtbfEl.innerText = globalRatio;
}

function showToast(m, t = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const toast = document.createElement('div');
    toast.className = `toast ${t}`;
    toast.innerHTML = `<span>${t === 'error' ? '❌' : '✅'}</span> ${m}`;
    c.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
        document.body.classList.add('dark-mode');
        toggleThemeIcons(true);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    toggleThemeIcons(isDark);
}

function toggleThemeIcons(isDark) {
    const sun = document.querySelector('.icon-sun');
    const moon = document.querySelector('.icon-moon');
    if (sun && moon) {
        sun.classList.toggle('hidden', !isDark);
        moon.classList.toggle('hidden', isDark);
    }
}

// Fallback upload (Mismo parseo seguro)
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const wrapper = document.getElementById('loader-wrapper');
        if(wrapper) { wrapper.style.display = 'flex'; wrapper.style.opacity = '1'; wrapper.classList.remove('loaded', 'hidden', 'fade-out'); runLoaderSimulation(); }
        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, {type: 'array', raw: true, cellDates: false});
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rowsRaw = XLSX.utils.sheet_to_json(sheet, {defval:""});
                    const rows = rowsRaw.map(cleanRowKeys);
                    
                    let liftsMap = {};
                    rows.forEach(row => {
                        const idObra = row.IDOBRA || row.ID_OBRA || row.ID;
                        if (!idObra) return;
                        if (!liftsMap[idObra]) {
                            liftsMap[idObra] = {
                                id: idObra,
                                name: row.NOMBREOBRA || "Sin nombre",
                                dependency: row.DEPENDENCIA || "Otras",
                                date: safeDateFormatter(row.FECHAPM),
                                averias: []
                            };
                        }
                        if (row.IDAVERIA || row.ID_AVERIA) {
                            // CHECK DUPLICADOS EN UPLOAD MANUAL
                            const exists = liftsMap[idObra].averias.some(a => String(a.id) === String(row.IDAVERIA || row.ID_AVERIA));
                            if(!exists) {
                                liftsMap[idObra].averias.push({
                                    id: row.IDAVERIA || row.ID_AVERIA,
                                    desc: row.DESCAVERIA || row.DESC_AVERIA,
                                    date: safeDateFormatter(row.FECHAAVERIA || row.FECHA_AVERIA),
                                    category: row.CATEGORIA
                                });
                            }
                        }
                    });
                    fullData = Object.values(liftsMap);
                    finalizeDataLoading();
                } catch (err) { console.error(err); showToast("Error formato.", "error"); } finally { e.target.value = ''; }
            };
            reader.readAsArrayBuffer(file);
        }, 1000);
    });
}
