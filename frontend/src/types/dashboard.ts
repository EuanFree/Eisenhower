/**
 * Dashboard TypeScript Interfaces
 *
 * Type definitions for the Dashboard Builder feature, including dashboard
 * metadata, widget configuration, and data source payloads.
 */

/** Supported widget visualization types */
export type WidgetType =
  | 'COLUMN_CHART'
  | 'LINE_CHART'
  | 'AREA_CHART'
  | 'GAUGE'
  | 'BURNDOWN'
  | 'SCATTER'
  | 'NUMBER_CARD'
  | 'TABLE';

/** Data source method for a widget */
export type DataSourceType = 'ENDPOINT' | 'SQL_QUERY';

/** Sharing scope for a dashboard */
export type SharingScope = 'PRIVATE' | 'PROJECT_SHARED' | 'SYSTEM_GLOBAL';

/** Security classification level */
export type PresetClassification = 'OFFICIAL' | 'SECRET' | 'TOP_SECRET';

/** Canvas position and size for a widget */
export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Configuration for an endpoint-based data source */
export interface EndpointDataSourceConfig {
  url: string;
  jsonPath: string;
  method?: 'GET';
  headers?: Record<string, string>;
}

/** Configuration for a SQL query-based data source */
export interface SqlQueryDataSourceConfig {
  sql: string;
  params?: Record<string, unknown>;
}

/** Union of data source configuration types */
export type DataSourceConfig = EndpointDataSourceConfig | SqlQueryDataSourceConfig;

/** Display configuration for chart widgets */
export interface DisplayConfig {
  /** Chart title override */
  title?: string;
  /** Color palette for the chart */
  colors?: string[];
  /** X-axis field name */
  xAxisField?: string;
  /** Y-axis field name(s) */
  yAxisFields?: string[];
  /** Aggregation function */
  aggregation?: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'NONE';
  /** Whether to stack bars (for column charts) */
  stacked?: boolean;
  /** Gauge minimum value */
  gaugeMin?: number;
  /** Gauge maximum value */
  gaugeMax?: number;
  /** Gauge threshold colors: { value: number; color: string }[] */
  gaugeThresholds?: { value: number; color: string }[];
  /** Number of decimal places */
  decimals?: number;
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to show legend */
  showLegend?: boolean;
  /** Custom label format */
  labelFormat?: string;
}

/** A single widget instance on the dashboard canvas */
export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  widget_type: WidgetType;
  title: string;
  data_source_type: DataSourceType;
  data_source_config?: DataSourceConfig;
  display_config?: DisplayConfig;
  position?: WidgetPosition;
  created_at: string;
  updated_at: string;
}

/** Full dashboard with its widgets */
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  owner_user_id: string;
  project_id?: string;
  sharing_scope: SharingScope;
  classification: PresetClassification;
  layout_config?: Record<string, unknown>;
  widgets: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

/** Request payload for creating a dashboard */
export interface DashboardCreatePayload {
  name: string;
  description?: string;
  project_id?: string;
  sharing_scope?: SharingScope;
  classification?: PresetClassification;
}

/** Request payload for updating a dashboard */
export interface DashboardUpdatePayload {
  name?: string;
  description?: string;
  project_id?: string;
  sharing_scope?: SharingScope;
  classification?: PresetClassification;
  layout_config?: Record<string, unknown>;
}

/** Request payload for creating a widget */
export interface DashboardWidgetCreatePayload {
  widget_type: WidgetType;
  title?: string;
  data_source_type: DataSourceType;
  data_source_config?: DataSourceConfig;
  display_config?: DisplayConfig;
  position?: WidgetPosition;
}

/** Request payload for updating a widget */
export interface DashboardWidgetUpdatePayload {
  widget_type?: WidgetType;
  title?: string;
  data_source_type?: DataSourceType;
  data_source_config?: DataSourceConfig;
  display_config?: DisplayConfig;
  position?: WidgetPosition;
}

/** SQL query execution request */
export interface SqlQueryRequest {
  sql: string;
  params?: Record<string, unknown>;
}

/** SQL query execution response */
export interface SqlQueryResponse {
  rows: Record<string, unknown>[];
  row_count: number;
  columns: string[];
}

/** Allowed column metadata for SQL builder */
export interface AllowedColumn {
  name: string;
  type: string;
}

/** Allowed table metadata for SQL builder */
export interface AllowedTable {
  name: string;
  columns: AllowedColumn[];
}

/** Widget type metadata for the palette */
export interface WidgetTypeInfo {
  type: WidgetType;
  label: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
  description: string;
}
