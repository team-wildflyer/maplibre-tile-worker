import Logger from 'logger'

export class TileWorker<Params> {

  constructor(
    private readonly drawer: (params: Params) => TileDrawer<Params>,
    private readonly options: TileWorkerOptions = {}
  ) {}

  private readonly logger = new Logger('TileWorker')
  private currentDrawer: TileDrawer<Params> | null = null

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

  private async handleDrawMessage(payload: Params) {
    const drawer = this.drawer(payload)
    this.currentDrawer = drawer

    const buffer = await drawer.draw(payload)
    if (buffer == null) {
      return self.postMessage({
        type:    'result',
        payload: null,
      })
    } else {
      // Note: typing for `self.postMessage` is incorrect. It is set up for window messaging, not for worker
      // messaging. Use a quick cast to `any` to bypass the type check.
      return (self.postMessage as any)({
        type:    'result',
        payload: buffer,
      }, [buffer])
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

interface TileDrawer<Params> {
  draw:   (params: Params) => Promise<ArrayBuffer | null> | ArrayBuffer | null
  abort?: () => void
}

export interface TileWorkerOptions {
  additionalMessageHandlers?: Record<string, (payload: any) => void>
}