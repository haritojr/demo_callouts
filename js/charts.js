let barChartInstance = null;
let pieChartInstance = null;
let trendChartInstance = null; 

function renderCharts(data) {
    if (!data || data.length === 0) return;

    // --- PREPARACIÓN DE DATOS ---
    const top10 = [...data].sort((a,b) => b.averias.length - a.averias.length).slice(0, 10);

    let cats = {"Fallo Instalación":0, "Fallo Montaje":0, "Otros":0};
    data.forEach(l => l.averias.forEach(av => {
        let catKey = "Otros";
        if(av.category === "Fallo Instalación") catKey = "Fallo Instalación";
        if(av.category === "Fallo Montaje") catKey = "Fallo Montaje";
        cats[catKey]++;
    }));

    const timeline = {};
    data.forEach(lift => {
        lift.averias.forEach(av => {
            if (!av.date || av.date.length < 10) return;
            const parts = av.date.split('/'); 
            if(parts.length === 3) {
                const key = `${parts[2]}-${parts[1]}`; 
                timeline[key] = (timeline[key] || 0) + 1;
            }
        });
    });

    const sortedKeys = Object.keys(timeline).sort();
    let timelineLabels = sortedKeys.map(k => {
        const [y, m] = k.split('-');
        return `${m}/${y}`;
    });
    const timelineData = sortedKeys.map(k => timeline[k]);

    // --- INTEGRACIÓN IA (PREDICCIÓN) ---
    let aiTrendData = [];
    if (typeof IAModule !== 'undefined' && timelineData.length > 1) {
        const prediction = IAModule.predictTrend(timelineData);
        
        if (prediction) {
            // Añadir etiqueta para el mes futuro
            timelineLabels.push("PREDICCIÓN");
            
            // Los datos reales necesitan un 'null' al final para no pintar sobre la predicción
            // La línea de IA cubre todo el rango + 1
            aiTrendData = prediction.points;
            
            // Notificar al usuario sobre la tendencia
            const trendMsg = prediction.slope > 0 
                ? `⚠️ Tendencia IA: Aumento estimado de incidencias.` 
                : `✅ Tendencia IA: Las averías están remitiendo.`;
            console.log(trendMsg); // Opcional: mostrar en un toast
        }
    }

    // Alinear datos reales con la nueva etiqueta
    // El último punto real no debe conectarse visualmente mal con la predicción, 
    // así que Chart.js maneja nulls o simplemente superponemos.
    const realDataExtended = [...timelineData, null]; 

    // --- LIMPIEZA ---
    if (barChartInstance) barChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    if (trendChartInstance) trendChartInstance.destroy();

    // --- RENDERIZADO CON IA ---

    // 1. Gráfico de Tendencia + IA
    const ctxTrend = document.getElementById('trendChart');
    if (ctxTrend) {
        const ctx = ctxTrend.getContext('2d');
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
        gradientFill.addColorStop(0, 'rgba(201, 34, 40, 0.2)');
        gradientFill.addColorStop(1, 'rgba(201, 34, 40, 0.0)');

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timelineLabels,
                datasets: [
                    {
                        label: 'Datos Reales',
                        data: realDataExtended,
                        borderColor: '#c92228', 
                        backgroundColor: gradientFill,
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#c92228',
                        pointRadius: 5,
                        fill: true,
                        tension: 0.4,
                        order: 1 // Capa superior
                    },
                    {
                        label: 'Proyección IA',
                        data: aiTrendData,
                        borderColor: '#3b82f6', // Azul para IA
                        borderWidth: 2,
                        borderDash: [5, 5], // Línea punteada
                        pointRadius: 0, // Sin puntos, solo línea
                        fill: false,
                        tension: 0.4,
                        order: 2 // Capa inferior
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: true, position: 'bottom' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: { 
                    y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 2. Top 10 Reincidentes
    const ctxBar = document.getElementById('barChart');
    if (ctxBar) {
        const ctx = ctxBar.getContext('2d');
        const createGradient = (colorStart, colorEnd) => {
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, colorStart);
            gradient.addColorStop(1, colorEnd);
            return gradient;
        };

        const barColors = top10.map(l => {
            const c = l.averias.length;
            if (c >= 5) return createGradient('#ef4444', '#991b1b');
            if (c >= 2) return createGradient('#f97316', '#c2410c');
            return createGradient('#22c55e', '#15803d');
        });

        barChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(l => l.id),
                datasets: [{
                    label: 'Averías',
                    data: top10.map(l => l.averias.length),
                    backgroundColor: barColors, 
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    // --- TOOLTIP PERSONALIZADO AÑADIDO ---
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const lift = top10[context.dataIndex];
                                return [
                                    ` Averías: ${lift.averias.length}`,
                                    ` Obra: ${lift.name}`,
                                    ` Fecha: ${lift.date}`
                                ];
                            }
                        }
                    }
                },
                scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
            }
        });
    }

    // 3. Categorías
    const ctxPie = document.getElementById('pieChart');
    if (ctxPie) {
        const colors = ['#ea580c', '#2563eb', '#64748b']; 
        pieChartInstance = new Chart(ctxPie.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(cats),
                datasets: [{
                    data: Object.values(cats),
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: { legend: { display: false } },
                layout: { padding: 10 }
            }
        });
        
        const totalCats = Object.values(cats).reduce((a,b)=>a+b,0);
        const legendContainer = document.getElementById('catLegend');
        if (legendContainer) {
            legendContainer.innerHTML = Object.keys(cats).map((k, i) => {
                const val = Object.values(cats)[i];
                const pct = totalCats ? Math.round((val/totalCats)*100) : 0;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; padding:0.6rem 0; border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex; align-items:center; gap:0.6rem;">
                            <span style="width:10px; height:10px; border-radius:50%; background-color:${colors[i]}; box-shadow: 0 0 5px ${colors[i]}"></span>
                            <span style="font-weight:700; color:#475569; text-transform:uppercase;">${k}</span>
                        </div>
                        <div><strong style="color:#1e293b">${val}</strong> <span style="color:#94a3b8; font-size:0.75rem">(${pct}%)</span></div>
                    </div>
                `;
            }).join('');
        }
    }
}