// Модульна збірка ECharts: лише потрібні типи графіків — окремий ліниво завантажуваний чанк
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, HeatmapChart, PieChart, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent, CanvasRenderer]);

export default echarts;
