import {
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	CompletionItemKind,
	Range,
} from 'vscode-languageserver';

import { loglog , logloglog } from './utils';


export let antlrP4HeaderDec: Map<string, any[]> = new Map();
export let antlrP4StructHeaders: Map<string, string> = new Map();

import { CommonTokenStream, InputStream} from 'antlr4';
import { ErrorListener } from 'antlr4/error';

import { P4Lexer } from './antlr_autogenerated/P4Lexer';
import { P4Parser } from './antlr_autogenerated/P4Parser';
import { P4Listener } from './antlr_autogenerated/P4Listener';
import { ParseTreeWalker } from 'antlr4/tree';

import { connection } from './server';


let MyP4Listner = function() : void {
	P4Listener.call(this); // inherit default listener
	return this;
};
// continue inheriting default listener
MyP4Listner.prototype = Object.create(P4Listener.prototype);
MyP4Listner.prototype.constructor = MyP4Listner;


////symbol table -> installed package from https://www.npmjs.com/package/symbol-table (npm install symbol-table)
export var SymbolTable = require("symbol-table/stack")();

//pointers array (no pointers in Javascript but this will act like it)
// var symPtrs = [];
//pushing global scope to the top of the pointer array
// symPtrs.push(SymbolTable());



MyP4Listner.prototype.enterConstantDeclaration = function(ctx) {
	logloglog("ENTER - Constant - " + ctx.name().getText());
	SymbolTable.set(ctx.name().getText(), {"ctx": ctx, "typeref": ctx.typeref().getText()});
};

MyP4Listner.prototype.enterParserDeclaration = function(ctx) {
	let name:string = ctx.parserTypeDeclaration().name().getText();
	let typeref:string = "parser";

	logloglog("ENTER - Parser - " + name);
	SymbolTable.set(name, {"ctx": ctx, "typeref": typeref});
	SymbolTable.push();
};

MyP4Listner.prototype.enterParserDeclaration = function(ctx) {
	SymbolTable.pop();
};


export function sendToAntlrCompiler(textDocument: TextDocument){
	loglog("Running Antlr Compiler");
	let myP4Listner = new MyP4Listner();
	let errorListener: MyErrorListner = new MyErrorListner(textDocument);
	let tree = setupLexerAndParser(textDocument, errorListener);
	try{
		ParseTreeWalker.DEFAULT.walk(myP4Listner, tree);
	} catch(e){}

	if(!errorListener.isEmpty()){
		let diagnostics: Diagnostic[] = errorListener.getDiagnostics();
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	}
}

function setupLexerAndParser(textDocument: TextDocument, errorListener: MyErrorListner) {
	let input: string = textDocument.getText();
	let chars = new InputStream(input);
	let lexer = new P4Lexer(chars);
	lexer.strictMode = false; // do not use js strictMode
	let tokens = new CommonTokenStream(lexer);
	let parser = new P4Parser(tokens);

	parser.removeErrorListeners(); // Remove default ConsoleErrorListener
	parser.addErrorListener(errorListener); // Add custom error listener

	parser.buildParseTrees = true;
	let tree = parser.input();
	return tree;
}

class MyErrorListner extends ErrorListener {
	textDocument: TextDocument;
	diagnostics: Diagnostic[] = [];

	constructor(text: TextDocument){
		super();
		this.textDocument = text;
	}

	isEmpty(): boolean {
		return this.diagnostics.length == 0;
	}

	getDiagnostics(): Diagnostic[]{
		return this.diagnostics;
	}

	syntaxError(recognizer, symbol, line, column, message, payload) {
		let diagnosic : Diagnostic = this.convertToDiagnostic(symbol, message);
		this.diagnostics.push(diagnosic);
	}

	convertToDiagnostic(symbol, message): Diagnostic{
		let diagnosic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: this.textDocument.positionAt(symbol.start),
				end: this.textDocument.positionAt(symbol.stop),
			},
			message: message,
			source: 'P4 Extension'
		};
		return diagnosic;
	}
}

