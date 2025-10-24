import Logger from 'logger'
import { EmptyObject } from 'ytil'

export class TileWorker<Data = EmptyObject> {

  constructor(
    private readonly renderer: (url: string, data: Data) => TileRenderer,
    private readonly options: TileWorkerOptions = {}
  ) {}

  private readonly logger = new Logger('TileWorker')
  private currentRenderer: TileRenderer | null = null

  public install() {
    self.addEventListener('message', this.messageHandler)
  }
  
  private messageHandler = async (event: MessageEvent) => {
    const data = event.data as (
      | {type: 'render', payload: {url: string, data: Data}}
      | {type: 'render:abort'}
      | {type: string, payload: any}
    )

    switch (data.type) {
    case 'render':
      return await this.handleDrawMessage(data.payload.url, data.payload.data)
    case 'render:abort':
      return this.handleDrawAbortMessage()
    default:
      return this.handleAdditionalMessage(data.type, (data as any).payload)
    }
  }

  private async handleDrawMessage(url: string, requestData: Data) {
    if (this.currentRenderer != null) {
      throw new Error("Tile drawing is already in progress")
    }

    try {
      const renderer = this.renderer(url, requestData)
      this.currentRenderer = renderer

      const data: ArrayBuffer | null = await renderer.render()

      // If the current drawer has changed or been invalidated, don't return anything.
      if (renderer !== this.currentRenderer) { return }

      if (data == null) {
        return postMessage({
          type:    'render:result',
          payload: {
            data: null,
            url,
          }})
      } else {
        return postMessage({
          type:    'render:result',
          payload: {data, url},
        }, {
          transfer: [data],
        })
      }
    } catch (error) {
      // Ignore abort errors.
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.debug("Draw request was aborted", {url})
        return
      }

      console.error(`Error while drawing ${url}: ${error}`)
    } finally {
      this.currentRenderer = null
    }
  }

  private handleDrawAbortMessage() {
    this.currentRenderer?.abort?.()
    this.currentRenderer = null
    return postMessage({type: 'render:aborted'})
  }
  
  private handleAdditionalMessage(type: string, payload: any) {
    const {additionalMessageHandlers = {}} = this.options
    const handler = additionalMessageHandlers[type]
    if (handler == null) {
      this.logger.warning('Unknown message type', {type, payload})
      return 
    }

    handler(payload)
  }

}

interface TileRenderer {
  render: () => Promise<ArrayBuffer | null>
  abort?: () => void
}

export interface TileWorkerOptions {
  additionalMessageHandlers?: Record<string, (payload: any) => void>
}