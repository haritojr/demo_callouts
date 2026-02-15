/**
 * MOTOR DE INTELIGENCIA ARTIFICIAL (LIGERO)
 * Modelo: Regresión Lineal Simple
 * Objetivo: Predecir la tendencia futura basada en datos históricos
 */

const IAModule = {
    // Entrenar modelo y predecir
    predictTrend: function(timelineData) {
        // 1. Preparar datos para el modelo (X = Tiempo, Y = Cantidad Averías)
        // Convertimos fechas a índices numéricos (0, 1, 2...)
        const xValues = timelineData.map((_, i) => i);
        const yValues = timelineData;

        const n = yValues.length;
        if (n < 2) return null; // Necesitamos al menos 2 puntos para una tendencia

        // 2. Algoritmo de Mínimos Cuadrados (Linear Regression)
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += xValues[i];
            sumY += yValues[i];
            sumXY += xValues[i] * yValues[i];
            sumXX += xValues[i] * xValues[i];
        }

        // Calcular pendiente (m) y punto de corte (b) -> y = mx + b
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // 3. Generar Predicciones
        // Calculamos la línea de tendencia para los puntos actuales + 1 mes futuro
        const trendLine = [];
        for (let i = 0; i <= n; i++) {
            trendLine.push(slope * i + intercept);
        }

        return {
            points: trendLine,
            slope: slope, // Si es positivo, la cosa empeora. Negativo, mejora.
            nextValue: Math.max(0, slope * n + intercept) // Predicción mes siguiente
        };
    }
};