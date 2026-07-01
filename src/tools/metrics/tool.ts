import { ExtendedTool, ToolHandlers } from '../../utils/types'
import { v1 } from '@datadog/datadog-api-client'
import { createToolSchema } from '../../utils/tool'
import { QueryMetricsZodSchema } from './schema'

type MetricsToolName = 'query_metrics'
type MetricsTool = ExtendedTool<MetricsToolName>

export const METRICS_TOOLS: MetricsTool[] = [
  createToolSchema(
    QueryMetricsZodSchema,
    'query_metrics',
    'Query timeseries points of metrics from Datadog',
  ),
] as const

type MetricsToolHandlers = ToolHandlers<MetricsToolName>

// Maximum allowed time range to prevent OOM / token-bomb (CWE-770)
const MAX_TIME_RANGE_SECONDS = 86400 // 24 hours

export const createMetricsToolHandlers = (
  apiInstance: v1.MetricsApi,
): MetricsToolHandlers => {
  return {
    query_metrics: async (request) => {
      const { from, to, query } = QueryMetricsZodSchema.parse(
        request.params.arguments,
      )

      const rangeSeconds = to - from
      if (rangeSeconds > MAX_TIME_RANGE_SECONDS) {
        throw new Error(
          `Time range too large: ${rangeSeconds}s exceeds maximum of ${MAX_TIME_RANGE_SECONDS}s (24 hours). ` +
            'Use a smaller time window or split into multiple requests.',
        )
      }

      if (from >= to) {
        throw new Error('`from` must be less than `to`')
      }

      const response = await apiInstance.queryMetrics({
        from,
        to,
        query,
      })

      return {
        content: [
          {
            type: 'text',
            text: `Queried metrics data: ${JSON.stringify({ response })}`,
          },
        ],
      }
    },
  }
}
