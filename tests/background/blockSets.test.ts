/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { BlockSet, BlockTestRes } from "@src/background/blockSet"
import { BlockSets } from "@src/background/blockSets"
import { BrowserStorage } from "@src/background/browserStorage"
import { timeToMSSinceMidnight } from "@src/shared/utils"
import { mocked } from "ts-jest/utils"
import blockSetCmpObj from "../testHelpers/blockSetCmpObj"

jest.mock("webextension-polyfill-ts", () => ({}))
jest.mock("@src/background/browserStorage")

const browserStorageMock = mocked(BrowserStorage, true)

describe("test BlockSets construction", () => {
	const testBlockSet = new BlockSet(42)
	test("loads block sets from block set storage", async() => {
		browserStorageMock.prototype.loadBlockSets
			.mockImplementation(async() => Promise.resolve([testBlockSet]))

		const blockSets = await BlockSets.create(new BrowserStorage({ preferSync: true }))
		expect(browserStorageMock).toBeCalledTimes(1)
		expect(blockSets.list).toStrictEqual([testBlockSet])
		expect(blockSets.map).toStrictEqual(new Map([[42, testBlockSet]]))
	})
	
	test("creates a default block set when storage is empty", async() => {
		browserStorageMock.prototype.loadBlockSets
			.mockImplementation(async() => Promise.resolve([]))
		
		const blockSets = await BlockSets.create(new BrowserStorage({ preferSync: true }))
		expect(blockSets.list).toStrictEqual([blockSetCmpObj(new BlockSet(0))])
		expect(blockSets.map).toStrictEqual(new Map([[0, blockSetCmpObj(new BlockSet(0))]]))
	})
})

describe("test BlockSets methods", () => {
	let blockSets: BlockSets
	beforeEach(async() => {
		browserStorageMock.prototype.loadBlockSets
			.mockImplementation(async() => Promise.resolve([new BlockSet(0, { name: "TEST" })]))
		blockSets = await BlockSets.create(new BrowserStorage({ preferSync: true }))
	})

	// New block sets should get saved to storage.
	// They should be assigned a non overlapping id.
	// Name should be "Block Set ${number}", 
	// number is based on the amount of old block sets starting with "Block Set".
	test("can add new default block sets", async() => {
		const newBlockSet = await blockSets.addDefaultBlockSet()
		const bsIds = blockSets.getIds()

		// Check for duplicate ids
		expect(new Set(bsIds).size).toBe(bsIds.length) 
		// Added block set is equal to default block set except from id and name
		const defaultBlockSet = new BlockSet(newBlockSet.id)
		defaultBlockSet.name = newBlockSet.name
		expect(newBlockSet).toStrictEqual(blockSetCmpObj(defaultBlockSet))

		expect(blockSets.list).toContain(newBlockSet)
		expect(blockSets.map.get(newBlockSet.id)).toStrictEqual(newBlockSet)
		expect(browserStorageMock.prototype.saveNewBlockSet)
			.toBeCalledWith(newBlockSet, blockSets.list)
	})

	test("added new block set name is 'Block Set ${number}' with restrictions", async() => {
		let newBlockSet = await blockSets.addDefaultBlockSet()
		expect(newBlockSet.name).toBe("Block Set 1")
		newBlockSet = await blockSets.addDefaultBlockSet()
		expect(newBlockSet.name).toBe("Block Set 2")

		newBlockSet.name = "Block Set 120"
		newBlockSet = await blockSets.addDefaultBlockSet()
		expect(newBlockSet.name).toBe("Block Set 121")
	})

	// Copied block sets should get saved to storage.
	// They should be assigned a non overlapping id.
	// Their name should have (copy) appended to the end.
	// If old name had "(copy)" already, then names should continue (copy2), (copy3) etc.
	test("can add new copies of block sets", async() => {
		const testBlockSet = new BlockSet(100, { name: "TEST" })
		const newBlockSet = await blockSets.addBlockSetCopy(testBlockSet)
		const bsIds = blockSets.getIds()

		// Check for duplicate ids
		expect(new Set(bsIds).size).toBe(bsIds.length)

		// Added block set is equal to copied block set except from id, name and time elapsed
		expect(newBlockSet.data).toStrictEqual({ ...testBlockSet.data, name: "TEST (copy)" })
		expect(newBlockSet.timeElapsed).toStrictEqual(0)

		expect(blockSets.list).toContain(newBlockSet)
		expect(blockSets.map.get(newBlockSet.id)).toStrictEqual(newBlockSet)
		expect(browserStorageMock.prototype.saveNewBlockSet)
			.toBeCalledWith(newBlockSet, blockSets.list)
	})

	test("added new block set copy name is '${copyName} (copy${number}x)' " +
	"with restrictions", async() => {
		const testBlockSet = new BlockSet(100, { name: "TEST" })
		let newBlockSet = await blockSets.addBlockSetCopy(testBlockSet)
		expect(newBlockSet.name).toStrictEqual(`${testBlockSet.name} (copy)`)
		newBlockSet = await blockSets.addBlockSetCopy(testBlockSet)
		expect(newBlockSet.name).toStrictEqual(`${testBlockSet.name} (copy)`)

		newBlockSet = await blockSets.addBlockSetCopy(newBlockSet)
		expect(newBlockSet.name).toStrictEqual(`${testBlockSet.name} (copy2x)`)

		newBlockSet = await blockSets.addBlockSetCopy(newBlockSet)
		expect(newBlockSet.name).toStrictEqual(`${testBlockSet.name} (copy3x)`)

		newBlockSet.name = "TEST (copy123x)"
		newBlockSet = await blockSets.addBlockSetCopy(newBlockSet)
		expect(newBlockSet.name).toStrictEqual(`${testBlockSet.name} (copy124x)`)
	})

	test("can remove block sets", async() => {
		const testBlockSet = blockSets.list[0]!
		await blockSets.deleteBlockSet(testBlockSet)

		expect(blockSets.list).toStrictEqual([])
		expect(blockSets.map.size).toStrictEqual(0)
		expect(browserStorageMock.prototype.deleteBlockSet)
			.toBeCalledWith(testBlockSet, [])
	})
})



describe("test BlockSets blockedBy method", () => {
	let blockSets: BlockSets
	beforeEach(async() => {
		browserStorageMock.prototype.loadBlockSets
			.mockImplementation(async() => Promise.resolve([]))
		blockSets = await BlockSets.create(new BrowserStorage({ preferSync: true }))
		await blockSets.addDefaultBlockSet()
		await blockSets.addDefaultBlockSet()

		const list = blockSets.list
		for (const bs of list) {
			bs.isInActiveTime = jest.fn().mockImplementation(() => true)
			bs.isInActiveWeekday = jest.fn().mockImplementation(() => true)
			bs.test = jest.fn().mockImplementation(() => BlockTestRes.Blacklisted)
		}
	})

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	test("block set methods are called with correct arguments", () => {
		const currentDate = new Date(2020, 1, 1, 8, 0, 0)
		jest.useFakeTimers("modern")
		jest.setSystemTime(currentDate)
		blockSets.blockedBy("testUrl", "testCategoryId", "testChannelId")
		expect(blockSets.list[0]!.test).toBeCalledWith("testUrl", "testCategoryId", "testChannelId")
		expect(blockSets.list[0]!.isInActiveTime).toBeCalledWith(timeToMSSinceMidnight(currentDate))
		expect(blockSets.list[0]!.isInActiveWeekday).toBeCalledWith(currentDate.getDay())
	})

	test("returns ids of each block set returning Blacklisted", () => {
		expect(blockSets.blockedBy("", null, null)).toStrictEqual(blockSets.getIds())
	})

	test("Ignores ids of each block set returning Whitelisted or Ignored", () => {
		blockSets.list[0]!.test = jest.fn().mockImplementation(() => BlockTestRes.Whitelisted)
		blockSets.list[1]!.test = jest.fn().mockImplementation(() => BlockTestRes.Ignored)
		expect(blockSets.blockedBy("", null, null)).toStrictEqual([blockSets.list[2]!.id])
	})

	test("Ignores ids of each block set not being in active time or active day or both", () => {
		blockSets.list[0]!.isInActiveTime = jest.fn().mockImplementation(() => false)
		blockSets.list[1]!.isInActiveWeekday = jest.fn().mockImplementation(() => false)
		blockSets.list[2]!.isInActiveTime = jest.fn().mockImplementation(() => false)
		blockSets.list[2]!.isInActiveWeekday = jest.fn().mockImplementation(() => false)

		expect(blockSets.blockedBy("", null, null)).toStrictEqual([])
	})
})
