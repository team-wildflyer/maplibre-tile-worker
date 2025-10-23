import Logger from 'logger'
import { EmptyObject } from 'ytil'

export class TileWorker<Data = EmptyObject> {

  constructor(
    private readonly drawer: (url: string, data: Data) => TileDrawer,
    private readonly options: TileWorkerOptions = {}
  ) {}

  private readonly logger = new Logger('TileWorker')
  private currentDrawer: TileDrawer | null = null

  public install() {
    self.addEventListener('message', this.messageHandler)
  }
  
  private messageHandler = async (event: MessageEvent) => {
    const data = event.data as (
      | {type: 'draw', payload: {url: string, data: Data}}
      | {type: 'draw:abort'}
      | {type: string, payload: any}
    )

    switch (data.type) {
    case 'draw':
      return await this.handleDrawMessage(data.payload.url, data.payload.data)
    case 'draw:abort':
      return this.handleDrawAbortMessage()
    default:
      return this.handleAdditionalMessage(data.type, (data as any).payload)
    }
  }

  private async handleDrawMessage(url: string, requestData: Data) {
    if (this.currentDrawer != null) {
      throw new Error("Tile drawing is already in progress")
    }

    try {
      const drawer = this.drawer(url, requestData)
      this.currentDrawer = drawer

      const data: ArrayBuffer | null = await drawer.draw(url)

      // If the current drawer has changed or been invalidated, don't return anything.
      if (drawer !== this.currentDrawer) { return }

      if (data == null) {
        return postMessage({type: 'draw:result', payload: {data: null, url}})
      } else {
        // Note: typing for `self.postMessage` is incorrect. It is set up for window messaging, not for worker
        // messaging. Use a quick cast to `any` to bypass the type check.
        return postMessage({type: 'draw:result', payload: {data, url}}, {transfer: [data]})
      }
    } catch (error) {
      // Ignore abort errors.
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.debug("Draw request was aborted", {url})
        return
      }

      console.error(`Error while drawing ${url}: ${error}`)
    } finally {
      this.currentDrawer = null
    }
  }

  private handleDrawAbortMessage() {
    this.currentDrawer?.abort?.()
    this.currentDrawer = null
    return postMessage({type: 'draw:aborted'})
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

interface TileDrawer {
  draw:   (url: string) => Promise<ArrayBuffer | null> | ArrayBuffer | null
  abort?: () => void
}

export interface TileWorkerOptions {
  additionalMessageHandlers?: Record<string, (payload: any) => void>
}