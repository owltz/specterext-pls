// from: https://github.com/jb55/nostr-js

const noble = require('./noble-secp256k1').default

const WS = typeof WebSocket !== 'undefined' ? WebSocket : 'works-only-in-browser!!!'

Relay.prototype.wait_connected = async function relay_wait_connected(data) {
	let retry = 1000
	while (true) {
		if (this.ws.readyState !== 1) {
			await sleep(retry)
			retry *= 1.5
		}
		else {
			return
		}
	}
}


function Relay(relay, opts={})
{
	if (!(this instanceof Relay))
		return new Relay(relay, opts)

	this.url = relay
	this.opts = opts

	if (opts.reconnect == null)
		opts.reconnect = true

	const me = this
	me.onfn = {}

	init_websocket(me)
		.catch(e => {
			if (me.onfn.error)
				me.onfn.error(e)
		})

	return this
}

function init_websocket(me) {
	return new Promise((resolve, reject) => {
		const ws = me.ws = new WS(me.url);

		let resolved = false
		ws.onmessage = (m) => {
			handle_nostr_message(me, m)
			if (me.onfn.message)
				me.onfn.message(m)
		}
		ws.onclose = (e) => {
			if (me.onfn.close)
				me.onfn.close(e)
			if (me.reconnecting)
				return reject(new Error("close during reconnect"))
			if (!me.manualClose && me.opts.reconnect)
				reconnect(me)
		}
		ws.onerror = (e) => {
			if (me.onfn.error)
				me.onfn.error(e)
			if (me.reconnecting)
				return reject(new Error("error during reconnect"))
			if (me.opts.reconnect)
				reconnect(me)
		}
		ws.onopen = (e) => {
			if (me.onfn.open)
				me.onfn.open(e)

			if (resolved) return

			resolved = true
			resolve(me)
		}
	});
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function reconnect(me)
{
	const reconnecting = true
	let n = 100
	try {
		me.reconnecting = true
		await init_websocket(me)
		me.reconnecting = false
	} catch {
		//console.error(`error thrown during reconnect... trying again in ${n} ms`)
		await sleep(n)
		n *= 1.5
	}
}

Relay.prototype.on = function relayOn(method, fn) {
	this.onfn[method] = fn
	return this
}

Relay.prototype.close = function relayClose() {
	if (this.ws) {
		this.manualClose = true
		this.ws.close()
	}
}

Relay.prototype.subscribe = function relay_subscribe(sub_id, filters) {
	if (Array.isArray(filters))
		this.send(["REQ", sub_id, ...filters])
	else
		this.send(["REQ", sub_id, filters])
}

Relay.prototype.unsubscribe = function relay_unsubscribe(sub_id) {
	this.send(["CLOSE", sub_id])
}

Relay.prototype.send = async function relay_send(data) {
	await this.wait_connected()
	this.ws.send(JSON.stringify(data))
}

function handle_nostr_message(relay, msg)
{
	let data
	try {
		data = JSON.parse(msg.data)
	} catch (e) {
		console.error("handle_nostr_message", e)
		return
	}
	if (data.length >= 2) {
		switch (data[0]) {
		case "EVENT":
			if (data.length < 3)
				return
			return relay.onfn.event && relay.onfn.event(data[1], data[2])
		case "EOSE":
			return relay.onfn.eose && relay.onfn.eose(data[1])
		case "NOTICE":
			return relay.onfn.notice && relay.onfn.notice(...data.slice(1))
		case "OK":
			return relay.onfn.ok && relay.onfn.ok(...data.slice(1))
		}
	}
}

function RelayPool(relays, opts)
{
	if (!(this instanceof RelayPool))
		return new RelayPool(relays, opts)

	this.onfn = {}
	this.relays = []
	this.opts = opts

	for (const relay of relays) {
		this.add(relay)
	}

	return this
}

RelayPool.prototype.close = function relayPoolClose() {
	for (const relay of this.relays) {
		relay.close()
	}
}

RelayPool.prototype.on = function relayPoolOn(method, fn) {
	for (const relay of this.relays) {
		this.onfn[method] = fn
		relay.onfn[method] = fn.bind(null, relay)
	}
	return this
}

RelayPool.prototype.has = function relayPoolHas(relayUrl) {
	for (const relay of this.relays) {
		if (relay.url === relayUrl)
			return true
	}

	return false
}

RelayPool.prototype.send = function relayPoolSend(payload, relay_ids) {
	const relays = relay_ids ? this.find_relays(relay_ids) : this.relays
	for (const relay of relays) {
		relay.send(payload)
	}
}

RelayPool.prototype.setupHandlers = function relayPoolSetupHandlers()
{
	// setup its message handlers with the ones we have already
	const keys = Object.keys(this.onfn)
	for (const handler of keys) {
		for (const relay of this.relays) {
			relay.onfn[handler] = this.onfn[handler].bind(null, relay)
		}
	}
}

RelayPool.prototype.remove = function relayPoolRemove(url) {
	let i = 0

	for (const relay of this.relays) {
		if (relay.url === url) {
			relay.ws && relay.ws.close()
			this.relays = this.relays.splice(i, 1)
			return true
		}

		i += 1
	}

	return false
}

RelayPool.prototype.subscribe = function relayPoolSubscribe(sub_id, filters, relay_ids) {
	const relays = relay_ids ? this.find_relays(relay_ids) : this.relays
	for (const relay of relays) {
		relay.subscribe(sub_id, filters)
	}
}

RelayPool.prototype.unsubscribe = function relayPoolUnsubscibe(sub_id, relay_ids) {
	const relays = relay_ids ? this.find_relays(relay_ids) : this.relays
	for (const relay of relays) {
		relay.unsubscribe(sub_id)
	}
}


RelayPool.prototype.add = function relayPoolAdd(relay) {
	if (relay instanceof Relay) {
		if (this.has(relay.url))
			return false

		this.relays.push(relay)
		this.setupHandlers()
		return true
	}

	if (this.has(relay))
		return false

	const r = Relay(relay, this.opts)
	this.relays.push(r)
	this.setupHandlers()
	return true
}

RelayPool.prototype.find_relays = function relayPoolFindRelays(relay_ids) {
	if (relay_ids instanceof Relay)
		return [relay_ids]

	if (relay_ids.length === 0)
		return []

	if (!relay_ids[0])
		throw new Error("what!?")

	if (relay_ids[0] instanceof Relay)
		return relay_ids

	return this.relays.reduce((acc, relay) => {
		if (relay_ids.some((rid) => relay.url === rid))
			acc.push(relay)
		return acc
	}, [])
}

async function signId(privkey, id) {
	return await noble.schnorr.sign(id, privkey)
}

async function verifyEvent(event) {
	return await noble.schnorr.verify(event.sig, event.id, event.pubkey)
}

function utf8_encode(txt) {
	if (typeof TextEncoder !== 'undefined' && TextEncoder) {
		const encoder = new TextEncoder()
		return encoder.encode(txt)
	} else {
		throw 'TextEncoder not available'
	}
}

async function calculateId(ev) {
	const commit = eventCommitment(ev)
	const sha256 = noble.utils.sha256;
	const buf = utf8_encode(commit);
	return hexEncode(await sha256(buf))
}

function eventCommitment(ev) {
	const {pubkey,created_at,kind,tags,content} = ev
	return JSON.stringify([0, pubkey, created_at, kind, tags, content])
}

function delegationCommitment(pk, conditions) {
	return `nostr:delegation:${pk}:${conditions}`
}

async function signDelegationToken(privkey, unsigned_token)
{
	const hash = hexEncode(await noble.utils.sha256(unsigned_token))
	return (await signId(privkey, hash))
}

async function createDelegation(privkey, publisherPubkey, conditions) {
	const pubkey = getPublicKey(privkey)
	const unsigned_token = delegationCommitment(publisherPubkey, conditions)
	const token = await signDelegationToken(privkey, unsigned_token)
	return {pubkey, publisherPubkey, conditions, token}
}

function createDelegationTag(delegation) {
	const { pubkey, conditions, token } = delegation
	return ["delegation", pubkey, conditions, token]
}

function upsert_delegation_tag(tags, delegation)
{
	let found = false
	for (const tag of tags) {
		if (tag.length >= 4 && tag[0] === "delegation") {
			tag[1] = delegation.pubkey
			tag[2] = delegation.conditions
			tag[3] = delegation.token
			return
		}
	}
	tags.push(createDelegationTag(delegation))
}

async function createDelegationEvent(publisher_privkey, ev, delegation) {
	let tags = ev.tags || []

	upsert_delegation_tag(tags, delegation)

	ev.tags = tags
	ev.pubkey = delegation.publisherPubkey
	ev.id = await calculateId(ev)
	ev.sig = await signId(publisher_privkey, ev.id)
	return ev
}

function hexChar(val) {
	if (val < 10)
		return String.fromCharCode(48 + val)
	if (val < 16)
		return String.fromCharCode(97 + val - 10)
}

function hexEncode(buf) {
	let str = ""
	for (let i = 0; i < buf.length; i++) {
		const c = buf[i]
		str += hexChar(c >> 4)
		str += hexChar(c & 0xF)
	}
	return str
}

function base64_decode(str)
{
	if (typeof Buffer !== 'undefined' && Buffer) {
		return Buffer.from(str, 'base64')
	} else if (typeof atob !== 'undefined' && atob) {
		return atob(str)
	}
	throw new Error("no base64 implementation")
}


function encryptDm(privkey, to, msg) {
	const shared_point = noble.getSharedSecret(privkey, '02' + to)
	const shared_x = shared_point.substr(2, 64)
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(
                'aes-256-cbc',
                Buffer.from(shared_x, 'hex'),
		iv
	)

	let encrypted = cipher.update(msg, 'utf8', 'base64');
        encrypted += cipher.final('base64');

	return encrypted + "?iv=" + iv.toString('base64')
}

function decryptDm(privkey, ev) {
	let [enc, iv] = ev.content.split("?")
	if (!iv || !enc)
		return
	iv = iv.slice(3)
	iv = base64_decode(iv)

	const shared_point = noble.getSharedSecret(privkey, '02' + ev.pubkey)
	const shared_x = shared_point.substr(2, 64)
	const decipher = crypto.createDecipheriv(
                'aes-256-cbc',
                Buffer.from(shared_x, 'hex'),
                iv
	)

	let decrypted = decipher.update(enc, "base64", "utf8")
	decrypted += decipher.final("utf8")

	return decrypted
}


function getPublicKey(privkey) {
	return noble.schnorr.getPublicKey(privkey)
}

export {
	Relay,
	RelayPool,
	signId,
	verifyEvent,
	calculateId,
	getPublicKey,
	decryptDm,
	encryptDm,
	delegationCommitment,
	createDelegationTag,
	createDelegationEvent,
	createDelegation,
	signDelegationToken,
	eventCommitment
}
