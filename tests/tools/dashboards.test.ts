import { v1 } from '@datadog/datadog-api-client'
import { describe, it, expect } from 'vitest'
import { createDatadogConfig } from '../../src/utils/datadog'
import { createDashboardsToolHandlers } from '../../src/tools/dashboards/tool'
import { createMockToolRequest } from '../helpers/mock'
import { http, HttpResponse } from 'msw'
import { setupServer } from '../helpers/msw'
import { baseUrl, DatadogToolResponse } from '../helpers/datadog'

const listDashboardsEndpoint = `${baseUrl}/v1/dashboard`
const getDashboardEndpoint = (id: string) => `${baseUrl}/v1/dashboard/${id}`

const IPI_START = '[DATADOG_DATA_START'
const IPI_END = '[DATADOG_DATA_END]'

describe('Dashboards Tool', () => {
  if (!process.env.DATADOG_API_KEY || !process.env.DATADOG_APP_KEY) {
    throw new Error('DATADOG_API_KEY and DATADOG_APP_KEY must be set')
  }

  const datadogConfig = createDatadogConfig({
    apiKeyAuth: process.env.DATADOG_API_KEY,
    appKeyAuth: process.env.DATADOG_APP_KEY,
    site: process.env.DATADOG_SITE,
  })

  const apiInstance = new v1.DashboardsApi(datadogConfig)
  const toolHandlers = createDashboardsToolHandlers(apiInstance)

  describe.concurrent('list_dashboards', async () => {
    it('should retrieve dashboards', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json({
          dashboards: [
            {
              id: 'abc-123',
              title: 'Production Overview',
              description: 'env:prod',
              url: '/dashboard/abc-123/production-overview',
              created_at: '2024-01-01T00:00:00.000Z',
              modified_at: '2024-06-01T00:00:00.000Z',
              author_handle: 'user@example.com',
              layout_type: 'ordered',
            },
          ],
        })
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {})
        const response = (await toolHandlers.list_dashboards(
          request,
        )) as unknown as DatadogToolResponse

        expect(response.content[0].text).toContain('Dashboards:')
        expect(response.content[0].text).toContain('Production Overview')
        expect(response.content[0].text).toContain('abc-123')
      })()

      server.close()
    })

    it('should wrap output in IPI trust boundary markers', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json({
          dashboards: [
            {
              id: 'abc-123',
              title: 'My Dashboard',
              description: '',
            },
          ],
        })
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {})
        const response = (await toolHandlers.list_dashboards(
          request,
        )) as unknown as DatadogToolResponse

        // IPI protection: attacker-controlled dashboard content must be wrapped
        expect(response.content[0].text).toContain(IPI_START)
        expect(response.content[0].text).toContain(IPI_END)
        const startIdx = response.content[0].text.indexOf(IPI_START)
        const endIdx = response.content[0].text.indexOf(IPI_END)
        expect(startIdx).toBeLessThan(endIdx)
      })()

      server.close()
    })

    it('should filter dashboards by name', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json({
          dashboards: [
            { id: 'abc-1', title: 'Production Overview', description: '' },
            { id: 'abc-2', title: 'Staging Dashboard', description: '' },
          ],
        })
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {
          name: 'production',
        })
        const response = (await toolHandlers.list_dashboards(
          request,
        )) as unknown as DatadogToolResponse

        expect(response.content[0].text).toContain('Production Overview')
        expect(response.content[0].text).not.toContain('Staging Dashboard')
      })()

      server.close()
    })

    it('should throw when no dashboards data is returned', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json({})
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {})
        await expect(toolHandlers.list_dashboards(request)).rejects.toThrow(
          'No dashboards data returned',
        )
      })()

      server.close()
    })

    it('should handle authentication errors', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json(
          { errors: ['Authentication failed'] },
          { status: 403 },
        )
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {})
        await expect(toolHandlers.list_dashboards(request)).rejects.toThrow()
      })()

      server.close()
    })

    it('should handle rate limit errors', async () => {
      const mockHandler = http.get(listDashboardsEndpoint, async () => {
        return HttpResponse.json(
          { errors: ['Rate limit exceeded'] },
          { status: 429 },
        )
      })

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('list_dashboards', {})
        await expect(toolHandlers.list_dashboards(request)).rejects.toThrow(
          'Rate limit exceeded',
        )
      })()

      server.close()
    })
  })

  describe.concurrent('get_dashboard', async () => {
    it('should retrieve a specific dashboard', async () => {
      const dashboardId = 'abc-123'
      const mockHandler = http.get(
        getDashboardEndpoint(dashboardId),
        async () => {
          return HttpResponse.json({
            id: dashboardId,
            title: 'Production Overview',
            description: 'Main production dashboard',
            layout_type: 'ordered',
            widgets: [
              { id: 1, definition: { type: 'timeseries', title: 'CPU Usage' } },
            ],
          })
        },
      )

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('get_dashboard', {
          dashboardId,
        })
        const response = (await toolHandlers.get_dashboard(
          request,
        )) as unknown as DatadogToolResponse

        expect(response.content[0].text).toContain('Dashboard:')
        expect(response.content[0].text).toContain('Production Overview')
        expect(response.content[0].text).toContain(dashboardId)
      })()

      server.close()
    })

    it('should wrap get_dashboard output in IPI trust boundary markers', async () => {
      const dashboardId = 'abc-123'
      const mockHandler = http.get(
        getDashboardEndpoint(dashboardId),
        async () => {
          return HttpResponse.json({
            id: dashboardId,
            title: 'My Dashboard',
            layout_type: 'ordered',
            widgets: [],
          })
        },
      )

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('get_dashboard', { dashboardId })
        const response = (await toolHandlers.get_dashboard(
          request,
        )) as unknown as DatadogToolResponse

        // IPI protection: attacker-controlled widget/title content must be wrapped
        expect(response.content[0].text).toContain(IPI_START)
        expect(response.content[0].text).toContain(IPI_END)
      })()

      server.close()
    })

    it('should handle authentication errors on get_dashboard', async () => {
      const dashboardId = 'abc-999'
      const mockHandler = http.get(
        getDashboardEndpoint(dashboardId),
        async () => {
          return HttpResponse.json(
            { errors: ['Authentication failed'] },
            { status: 403 },
          )
        },
      )

      const server = setupServer(mockHandler)

      await server.boundary(async () => {
        const request = createMockToolRequest('get_dashboard', { dashboardId })
        await expect(toolHandlers.get_dashboard(request)).rejects.toThrow()
      })()

      server.close()
    })
  })
})
