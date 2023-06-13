import * as sdk from 'matrix-js-sdk'
import { logger } from 'matrix-js-sdk/lib/logger.js'
import { ClientEvent } from 'matrix-js-sdk'
import Olm from "olm/olm_legacy.js"

global.Olm = Olm
logger.setLevel(logger.levels.ERROR)

export class Matrix {
	matrixClient
	connected

	constructor(url, user, token) {
		this.connected = false

		this.matrixClient = sdk.createClient({
			deviceId: "Streaks Server",
			baseUrl: url,
			accessToken: token,
			userId: user,
		})
	}

	async connect() {
		if (this.connected)
			return
		await this.matrixClient.initCrypto()
		await this.matrixClient.startClient()
		await new Promise((resolve, _reject) => {
			this.matrixClient.once(ClientEvent.Sync, () => {
				// Send encrypted message, even if member isn't trusted
				this.matrixClient.getCrypto().globalBlacklistUnverifiedDevices = false;
				this.matrixClient.getCrypto().globalErrorOnUnknownDevices = false;
				this.connected = true
				resolve()
			})
		})
	}

	disconnect() {
		if (!this.connected)
			return
		this.matrixClient.stopClient()
	}

	async sendMessage(roomID, message) {
		await this.matrixClient.joinRoom(roomID)
		await this.matrixClient.sendTextMessage(roomID, message)
	}
}
