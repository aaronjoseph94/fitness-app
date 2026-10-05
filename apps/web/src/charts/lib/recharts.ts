// Owns: the Recharts components the chart kit draws with — the one module that imports 'recharts', loaded on demand
// (../preload), so only these components (and what they need) end up in the lazily loaded chunk.
export {
  Area,
  Bar,
  BarChart,
  BarStack,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
