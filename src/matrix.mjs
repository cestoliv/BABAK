import * as sdk from 'matrix-js-sdk'
import { logger } from 'matrix-js-sdk/lib/logger.js'
import { ClientEvent } from 'matrix-js-sdk'
import Olm from "olm/olm_legacy.js"

import { LocalStorage } from 'node-localstorage'
import { LocalStorageCryptoStore } from 'matrix-js-sdk/lib/crypto/store/localStorage-crypto-store.js'

global.Olm = Olm
const localStorage = new LocalStorage('./store/matrix')

export class Matrix {
	matrixClient
	connected

	constructor(url, user, token) {
		this.connected = false
		// temp fix : https://github.com/matrix-org/matrix-js-sdk/issues/2415#issuecomment-1141246410
		const request = require("request")
		sdk.request(request)
		///

		this.matrixClient = sdk.createClient({
			deviceId: "Streaks Server",
			baseUrl: url,
			accessToken: token,
			userId: user,

			sessionStore: new sdk.MemoryStore({ localStorage }),
			cryptoStore: new LocalStorageCryptoStore(localStorage)
		})
	}

	async connect() {
		if (this.connected)
			return
		logger.setLevel(logger.levels.ERROR)
		await this.matrixClient.initCrypto()
		await this.matrixClient.startClient()
		await new Promise((resolve, _reject) => {
			this.matrixClient.once(ClientEvent.Sync, () => {
				// Send encrypted message, even if member isn't trusted
				this.matrixClient.setGlobalErrorOnUnknownDevices(false)
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
		await this.matrixClient.uploadKeys()
		await this.matrixClient.sendTextMessage(roomID, message)
	}
}
