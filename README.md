# demo_callouts
📊 Dashboard de Control de Averías - MP Ascensores
Herramienta web autónoma para la visualización y análisis de averías en instalaciones de
ascensores. Este dashboard centraliza la gestión de datos mediante archivos externos para una
administración sencilla.

🚀Arquitectura de Datos
El sistema utiliza un modelo basado en archivos CSV dinámicos. Toda la información se carga
bajo demanda desde la carpeta /data utilizando el navegador del usuario como procesador.
Archivos de Datos (Fuentes de Verdad)
1. data/usuarios.csv : Gestiona las credenciales de los técnicos y sus permisos de acceso
a instalaciones específicas.
2. data/informes.csv : Contiene el listado maestro de instalaciones y su historial detallado
de averías.

✨ Funcionalidades
Autenticación Basada en Roles: Acceso restringido según el ID de técnico definido en
usuarios.csv .
Sincronización Automática: Carga directa de informes al iniciar sesión mediante fetch
de archivos locales.
Diagnóstico con IA: Análisis automático de la tendencia de estabilización basado en
lógica de regresión lineal.
Visualización Detallada: Agrupación dinámica por delegaciones (Sevilla, Madrid, etc.) con
buscador integrado.
Analítica Global: KPIs en tiempo real, Top 10 de reincidentes y distribución por categorías
de fallo.
Modo Oscuro/Claro: Interfaz adaptable que persiste la preferencia del usuario en el
almacenamiento local.

📁 Estructura del Proyecto
/
├── index.html # Estructura principal y contenedores
├── data/
│ ├── usuarios.csv # Base de datos de técnicos (CSV)
│ └── informes.csv # Base de datos de averías (CSV)
├── css/
│ └── styles.css # Diseño premium, responsive y variables de color
├── js/
│ ├── charts.js # Lógica de renderizado de Chart.js
│ ├── ml-engine.js # Motor matemático de tendencias
│ └── main.js # Orquestador: Login, carga de archivos y UI
└── assets/
└── logo.png # Identidad corporativa

🛠️Cómo Administrar
1. Añadir un técnico: Edita data/usuarios.csv con Excel o cualquier editor de texto. Los
IDs de acceso deben ir separados por comas.
2. Actualizar averías: Añade filas a data/informes.csv . La aplicación procesa
automáticamente los datos agrupándolos por el ID de la obra.

🔧Tecnologías Utilizadas
SheetJS (xlsx.js): Utilizada para el parseo de archivos CSV y Excel binarios directamente
en el cliente.
Chart.js: Generación de gráficos dinámicos y reactivos.
CSS Custom Properties: Gestión de temas (Dark/Light) y diseño modular sin
dependencias externas.
