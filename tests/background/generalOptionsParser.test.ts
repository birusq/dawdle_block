import { plainToGeneralOptionsData, createDefaultGeneralOptionsData, GeneralOptionsData } 
	from "@src/background/generalOptionsParser"

describe("test GeneralOptions parsing", () => {
	const defaultGeneralOptions = createDefaultGeneralOptionsData()

	test("basic example is parsed", () => {
		const testOptionsObj = {
			v: 1,
			clockType: 12,
			displayHelp: false,
			theme: "light",
			settingProtection: "always",
			typingTestWordCount: 100,
		}

		expect(plainToGeneralOptionsData(testOptionsObj)).toStrictEqual(testOptionsObj)
	})

	test("non-objects throw", () => {
		expect(() => { plainToGeneralOptionsData("string") }).toThrow()
		expect(() => { plainToGeneralOptionsData(42) }).toThrow()
		expect(() => { plainToGeneralOptionsData(() => {return 0}) }).toThrow()
		expect(() => { plainToGeneralOptionsData(null)}).toThrow()
	})

	test("objects with members of invalid types throw", () => {

		const testOptionsObj = {
			v: 1,
			clockType: "string", 
			theme: undefined,
		} 

		expect(() => { plainToGeneralOptionsData(testOptionsObj)}).toThrow()
	})

	test("incomplete objects get filled with defaults", () => {
		expect(plainToGeneralOptionsData({})).toStrictEqual(defaultGeneralOptions)
	})

	test("objects retain their valid property names and lose invalid ones", () => {
		
		const testBlockSetObj = {
			displayHelp: true, 
			loseMe: "lost",
		}

		const generalOptions = plainToGeneralOptionsData(testBlockSetObj)

		expect(generalOptions).toHaveProperty("displayHelp")
		expect(generalOptions).not.toHaveProperty("loseMe")
	})

	test("V0 default theme (darkTheme=false) gets converted to default theme in V1", () => {
		const testBlockSetObj = {
			darkTheme: false,
		}

		const testBlockSetObjResult: GeneralOptionsData = {
			...defaultGeneralOptions,
			theme: "system",
		}

		expect(plainToGeneralOptionsData(testBlockSetObj)).toStrictEqual(testBlockSetObjResult)
	})

	
	test("V0 non-default theme (darkTheme=true) gets converted to dark theme in V1", () => {
		const testBlockSetObj = {
			darkTheme: true,
		}

		const testBlockSetObjResult: GeneralOptionsData = {
			...defaultGeneralOptions,
			theme: "dark",
		}

		expect(plainToGeneralOptionsData(testBlockSetObj)).toStrictEqual(testBlockSetObjResult)
	})
})