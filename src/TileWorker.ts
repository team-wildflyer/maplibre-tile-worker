import Logger from 'logger'

export class TileWorker {

  constructor(
    private readonly drawer: (url: string) => TileDrawer,
    private readonly options: TileWorkerOptions = {}
  ) {}

  private readonly logger = new Logger('TileWorker')
  private currentDrawer: TileDrawer | null = null

  public install() {
    self.addEventListener('message', this.messageHandler)
  }
  
  private messageHandler = async (event: MessageEvent) => {
    try {
      const {type, payload} = event.data as {type: string, payload: any}

      switch (type) {
      case 'draw':
        return await this.handleDrawMessage(payload)
      case 'abort':
        return this.handleAbortMessage()
      default:
        return this.handleAdditionalMessage(type, payload)
      }
    } catch (error) {
      setTimeout(() => {
        throw error
      }, 0)
    } finally {
      this.currentDrawer = null
    }
  }

  private async handleDrawMessage(url: string) {
    if (this.currentDrawer != null) {
      this.logger.warning('Tile drawing is already in progress, aborting previous request')
      this.currentDrawer.abort?.()
    }

    const drawer = this.drawer(url)
    this.currentDrawer = drawer

    const buffer = await drawer.draw(url)
    if (buffer == null) {
      return postMessage({type: 'result', payload: null})
    } else {
      // Note: typing for `self.postMessage` is incorrect. It is set up for window messaging, not for worker
      // messaging. Use a quick cast to `any` to bypass the type check.
      return postMessage({type: 'result', payload: buffer}, [buffer])
    }
  }

  private handleAbortMessage() {
    this.currentDrawer?.abort?.()
    this.currentDrawer = null
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

const postMessage = self.postMessage.bind(self) as (message: any, transfer?: Transferable[]) => void

interface TileDrawer {
  draw:   (url: string) => Promise<ArrayBuffer | null> | ArrayBuffer | null
  abort?: () => void
}

export interface TileWorkerOptions {
  additionalMessageHandlers?: Record<string, (payload: any) => void>
}