/**
 * MP ASCENSORES - LÓGICA DE SINCRONIZACIÓN CSV
 * Este archivo gestiona el login y la carga dinámica de datos desde la carpeta /data.
 */

// --- VARIABLES GLOBALES ---
let fullData = [];
let currentFilteredData = []; 
const THEME_KEY = 'mp_theme_preference';
let currentUser = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
});

function initEventListeners() {
    // Tema
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Login
    const loginBtn = document.getElementById('loginBtn');
    const loginInput = document.getElementById('loginId');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (loginInput) {
        loginInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm("¿Seguro que deseas cerrar sesión?")) {
                location.reload(); 
            }
        });
    }

    // Filtros
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

    // Listeners de búsqueda
    ['dateStart', 'dateEnd', 'liftSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', applyFilters);
    });

    // Menú lateral
    const toggleBtn = document.getElementById('toggleMenuBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const menu = document.getElementById('liftMenuContent');
            const chevron = document.getElementById('menuChevron');
            menu.classList.toggle('hidden');
            chevron.style.transform = menu.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    // Navegación de pestañas
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById('view-detalle').classList.toggle('hidden', view !== 'detalle');
            document.getElementById('view-graficos').classList.toggle('hidden', view !== 'graficos');
            
            // Forzar renderizado de gráficos al cambiar a la pestaña
            if (view === 'graficos' && typeof renderCharts === 'function') {
                setTimeout(() => renderCharts(currentFilteredData), 50);
            }
        });
    });
}

// --- LÓGICA DE LOGIN (LECTURA DE CSV) ---
async function handleLogin() {
    const inputId = document.getElementById('loginId').value.trim().toUpperCase();
    if (!inputId) {
        showToast("Por favor, introduce tu ID", "error");
        return;
    }

    const btn = document.getElementById('loginBtn');
    btn.innerHTML = 'Verificando...';
    btn.disabled = true;

    try {
        if (typeof XLSX === 'undefined') {
            throw new Error("Librería de Excel no cargada. Revisa la conexión a Internet.");
        }

        const response = await fetch('data/usuarios.csv');
        
        if (!response.ok) {
            if (location.protocol === 'file:') {
                throw new Error("ERROR DE SEGURIDAD: Los archivos locales solo funcionan con 'Live Server' en VS Code.");
            }
            throw new Error(`No se encontró 'data/usuarios.csv' (Error ${response.status})`);
        }
        
        const csvText = await response.text();
        const workbook = XLSX.read(csvText, { type: 'string' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const users = XLSX.utils.sheet_to_json(sheet);

        if (!users || users.length === 0) {
            throw new Error("El archivo de usuarios está vacío o mal formateado.");
        }

        const userRow = users.find(u => {
            const idKey = Object.keys(u).find(k => k.trim().toUpperCase() === 'ID');
            return idKey && String(u[idKey]).trim().toUpperCase() === inputId;
        });

        if (userRow) {
            currentUser = {
                id: inputId,
                name: userRow.NOMBRE || userRow.Nombre || "Usuario",
                role: userRow.ROL || userRow.Rol || "Técnico",
                access: (userRow.ACCESO || userRow.Acceso || "ALL").toString().split(',').map(s => s.trim())
            };

            document.getElementById('login-screen').classList.add('hidden');
            const loader = document.getElementById('loader-wrapper');
            if (loader) loader.classList.remove('hidden');
            
            runLoaderSimulation(() => {
                loadUserData(currentUser);
            });
        } else {
            throw new Error("ID de técnico no autorizado");
        }

    } catch (error) {
        console.error("Error Login:", error);
        showToast(error.message, "error");
        const card = document.querySelector('.login-card');
        if (card) {
            card.style.animation = 'none';
            card.offsetHeight;
            card.style.animation = 'shake 0.5s';
        }
    } finally {
        btn.innerHTML = 'Identificarse';
        btn.disabled = false;
    }
}

async function loadUserData(user) {
    const welcomeMsg = document.getElementById('user-welcome-msg');
    if (welcomeMsg) welcomeMsg.innerHTML = `Hola, <strong>${user.name}</strong> <span style="font-size:0.8em; opacity:0.7">(${user.role})</span>`;

    try {
        const response = await fetch('data/informes.csv');
        if (!response.ok) throw new Error("Error al descargar 'data/informes.csv'");
        
        const csvText = await response.text();
        const workbook = XLSX.read(csvText, { type: 'string' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        
        let liftsMap = {};

        rows.forEach(row => {
            const idObra = row.ID_OBRA || row.Id_Obra || row.id_obra;
            if (!idObra) return;

            if (!liftsMap[idObra]) {
                liftsMap[idObra] = {
                    id: idObra,
                    name: row.NOMBRE_OBRA || row.Nombre_Obra || "Sin nombre",
                    dependency: row.DEPENDENCIA || row.Delegación || "Otras",
                    date: parseExcelDate(row.FECHA_PM || row.Puesta_En_Marcha) || "--/--/----",
                    averias: []
                };
            }

            const idAv = row.ID_AVERIA || row.Id_Averia;
            if (idAv) {
                liftsMap[idObra].averias.push({
                    id: idAv,
                    desc: row.DESC_AVERIA || row.Descripción || "",
                    date: parseExcelDate(row.FECHA_AVERIA || row.Fecha_Averia) || "--/--/----",
                    category: row.CATEGORIA || row.Categoría || "Otros"
                });
            }
        });

        const allLifts = Object.values(liftsMap);

        if (user.access.includes("ALL")) {
            fullData = allLifts;
        } else {
            fullData = allLifts.filter(lift => user.access.includes(lift.id));
        }

        currentFilteredData = [...fullData];
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('mainContent').classList.remove('hidden'); 
        
        const empty = fullData.length === 0;
        document.getElementById('emptyState').classList.toggle('hidden', !empty);
        if (empty) document.getElementById('mainContent').classList.add('hidden');

        renderList(currentFilteredData);
        updateStats();

        // Si ya estamos en la pestaña de gráficos (o por defecto para precargar), renderizamos
        if (typeof renderCharts === 'function') renderCharts(currentFilteredData);

        showToast(`Datos sincronizados: ${fullData.length} instalaciones.`, "success");

    } catch (error) {
        console.error("Error informes:", error);
        showToast("Error al procesar la base de datos de averías", "error");
    }
}

// --- UTILIDADES ---

function runLoaderSimulation(onComplete) {
    const bar = document.getElementById('bar');
    const wrapper = document.getElementById('loader-wrapper');
    const textEl = document.getElementById('loaderText');
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 25;
        if (progress > 100) progress = 100;
        if (bar) bar.style.width = `${progress}%`;

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
    }, 120);
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

function showToast(m, t = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const toast = document.createElement('div');
    toast.className = `toast ${t}`;
    toast.innerHTML = `<span>${t === 'error' ? '❌' : '✅'}</span> ${m}`;
    c.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

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
        const matchesName = lift.id.toLowerCase().includes(term) || lift.name.toLowerCase().includes(term);
        return term === '' || matchesName || lift.averias.some(av => av.desc.toLowerCase().includes(term));
    });

    renderList(currentFilteredData);
    updateStats();

    if (!document.getElementById('view-graficos').classList.contains('hidden')) {
        if (typeof renderCharts === 'function') renderCharts(currentFilteredData);
    }
}

function renderList(data) {
    const list = document.getElementById('liftList');
    if(!list) return;
    list.innerHTML = '';
    
    const grouped = data.reduce((acc, l) => {
        const dep = l.dependency || "Otras";
        if (!acc[dep]) acc[dep] = [];
        acc[dep].push(l);
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(dep => {
        const group = document.createElement('div');
        group.className = 'dependency-group';
        group.innerHTML = `<div class="dependency-header"><span>${dep}</span><span class="badge-count">${grouped[dep].length}</span></div>`;
        const items = document.createElement('div');
        items.className = 'dependency-items';
        grouped[dep].forEach(lift => {
            const item = document.createElement('div');
            item.className = `list-item ${lift.averias.length >= 5 ? 'status-critical' : lift.averias.length >= 2 ? 'status-warning' : 'status-ok'}`;
            item.innerHTML = `<div><span style="font-size:0.7rem;">${lift.id}</span><div>${lift.name}</div></div><span class="list-badge">${lift.averias.length}</span>`;
            item.onclick = () => {
                document.querySelectorAll('.list-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                showDetail(lift);
            };
            items.appendChild(item);
        });
        group.appendChild(items);
        list.appendChild(group);
    });
}

function showDetail(lift) {
    document.getElementById('selectLiftPrompt').classList.add('hidden');
    const detail = document.getElementById('liftDetailView');
    detail.classList.remove('hidden');
    document.getElementById('detailId').innerText = lift.id;
    document.getElementById('detailName').innerText = lift.name;
    document.getElementById('detailDate').innerText = lift.date;
    document.getElementById('detailCount').innerText = lift.averias.length;

    // --- ANÁLISIS IA (Diagnóstico de Estabilización) ---
    const analysis = analyzeCommissioning(lift);
    const oldAnalysis = document.getElementById('dynamic-analysis');
    if(oldAnalysis) oldAnalysis.remove();

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

    const container = document.getElementById('averiasContainer');
    container.innerHTML = lift.averias.length ? lift.averias.map(av => `
        <div class="averia-card">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;">
                <strong>#${av.id}</strong><span>${av.date}</span>
            </div>
            <p style="margin:0; font-size:0.9rem;">${av.desc}</p>
        </div>
    `).join('') : '<p style="text-align:center; opacity:0.5; padding: 2rem;">Sin incidencias registradas.</p>';

    if (window.innerWidth <= 768) detail.scrollIntoView({ behavior: 'smooth' });
}

// --- FUNCIONES MATEMÁTICAS Y DE FECHAS ---

function parseDateString(s) {
    if (!s || s === "--/--/----") return null;
    const p = s.split('/');
    if (p.length !== 3) return null;
    return new Date(p[2], p[1] - 1, p[0]);
}

function parseExcelDate(val) {
    if (!val) return '';
    let str = String(val).trim();
    if (str.includes('/') || str.includes('-')) return str;
    let n = parseFloat(str);
    if (!isNaN(n) && n > 10000) {
        let d = new Date(Math.round((n - 25569) * 86400 * 1000));
        d = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    return str;
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
        message = "Volumen excesivo de avisos.";
        icon = "🟠";
        cssClass = "analysis-warning";
    } else if (m1 > 0 && m2 === 0 && m3 === 0) {
        status = "IDEAL";
        message = "Estabilización perfecta tras entrega.";
        icon = "🔵";
        cssClass = "analysis-ideal";
    }
    return { buckets, status, message, icon, cssClass };
}

function updateStats() {
    const total = currentFilteredData.reduce((s,l) => s + l.averias.length, 0);
    const affected = currentFilteredData.filter(l => l.averias.length > 0).length;
    document.getElementById('stat-averias').innerText = total;
    document.getElementById('stat-lifts').innerText = affected;
    document.getElementById('stat-mtbf').innerText = total > 0 ? (365 * affected / total).toFixed(0) : "--";
}