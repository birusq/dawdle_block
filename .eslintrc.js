module.exports = {
	plugins: [],
	extends: [
		"eslint:recommended",
		"preact",
	],
	parserOptions: {
		project: "./tsconfig.json",
		ecmaVersion: 12,
		sourceType: "module",
	},
	ignorePatterns: [
		"legacy/**/*",
		"dist/**/*",
		"coverage/**/*",
	],
	env: {
		webextensions: true,
		browser: true,
		node: true,
		amd: true,
		es2021: true,
	},
	globals: {
		JSX: "readonly",
	},
	rules: {
		indent: ["error", "tab"],
		"linebreak-style": ["error", "unix"],
		quotes: ["error", "double"],
		"key-spacing": ["error", { 
			beforeColon: false,
			afterColon: true,
			mode: "strict",
		}],
		"consistent-return": "error",
		eqeqeq: ["error",	"always"],
		camelcase: "error",
		"brace-style": ["error",	"stroustrup", { allowSingleLine: true	}],
		"max-len": ["error",	{ code: 100,	tabWidth: 2, ignorePattern: "^\\s*// eslint-.*$" }],
		"space-before-blocks": "error",
		"space-before-function-paren": ["error",	"never"],
		"space-in-parens": ["error", "never"],
		"arrow-spacing": "error",
		"object-curly-spacing": ["error", "always"],
		"array-bracket-spacing": ["error", "never"],
		"comma-spacing": ["error", { before: false, after: true }],
		"comma-dangle": ["error", "always-multiline"],
		"space-infix-ops": "error",
		"jest/expect-expect": ["error", {	assertFunctionNames: ["expect*", "**.expect"] }],
	},
	overrides: [
		{
			files: [
				"*.ts",
				"*.tsx",
			],
			parser: "@typescript-eslint/parser",
			plugins: ["@typescript-eslint", "jsdoc"],
			extends: [
				"plugin:@typescript-eslint/recommended",
			],
			rules: {
				"no-unused-vars": "off",
				"@typescript-eslint/no-unused-vars": ["error", { 
					varsIgnorePattern: "^_", 
					argsIgnorePattern: "^_", 
					ignoreRestSiblings: true, 
				}],
				"no-empty-function": "off",
				"@typescript-eslint/no-empty-function": ["error", {
					allow: ["private-constructors"] }],
				"@typescript-eslint/type-annotation-spacing": "error",
				semi: "off",
				"@typescript-eslint/semi": ["error", "never"],
				"@typescript-eslint/prefer-nullish-coalescing": "error",
				"@typescript-eslint/strict-boolean-expressions": "error",
				"jsdoc/require-jsdoc": ["warn", {
					// Require top level function comments	
					contexts: [
						"Program > ExportNamedDeclaration > VariableDeclaration" +
						" > VariableDeclarator > ArrowFunctionExpression", 
						"Program > VariableDeclaration" +
						" > VariableDeclarator > ArrowFunctionExpression", 
					],
					// Require class declaration and method comments					
					require: {
						ClassDeclaration: true, 
						MethodDefinition: true,
					},
					publicOnly: false,
					exemptEmptyFunctions: true,
					enableFixer: false,
					checkGetters: false,
					checkSetters: false,
				}],
				"require-await": "off",
				"@typescript-eslint/require-await": "error",
				"@typescript-eslint/no-floating-promises": "error",
				"no-useless-constructor": "off",
				"@typescript-eslint/no-useless-constructor": ["error"],
			},
		},
	],
}