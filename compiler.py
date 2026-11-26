"""MiniLang pipeline: lexer, parser, semantic analysis, TAC, optimizer and interpreter."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

KEYWORDS = {
    "START", "STOP", "INT", "FLOAT", "STRING", "BOOL", "IF", "ELSE", "ENDIF",
    "WHILE", "ENDWHILE", "FUNCTION", "ENDFUNCTION", "RETURN", "PRINT", "INPUT",
    "AND", "OR", "NOT", "TRUE", "FALSE",
}
TYPES = {"INT", "FLOAT", "STRING", "BOOL"}
COMPARISONS = {"==", "!=", "<", "<=", ">", ">="}


def empty_span() -> dict[str, int]:
    return {
        "start_line": 1,
        "start_column": 1,
        "end_line": 1,
        "end_column": 1,
    }


def diag(
    code: str,
    severity: str,
    message: str,
    phase: str,
    span: dict[str, int] | None = None,
    hint: str | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "phase": phase,
        "span": span or empty_span(),
        "hint": hint,
    }


@dataclass
class Token:
    kind: str
    lexeme: str
    value: str | int | float | bool | None
    start_line: int
    start_column: int

    @property
    def span(self) -> dict[str, int]:
        return {
            "start_line": self.start_line,
            "start_column": self.start_column,
            "end_line": self.start_line,
            "end_column": self.start_column + len(self.lexeme),
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "lexeme": self.lexeme,
            "value": self.value,
            "span": self.span,
        }


class Lexer:
    def __init__(self, source: str) -> None:
        self.source = source
        self.i = 0
        self.line = 1
        self.column = 1
        self.tokens: list[Token] = []
        self.diagnostics: list[dict[str, Any]] = []

    def peek(self, offset: int = 0) -> str:
        pos = self.i + offset
        return self.source[pos] if pos < len(self.source) else ""

    def advance(self) -> str:
        char = self.source[self.i]
        self.i += 1
        if char == "\n":
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return char

    def add(self, kind: str, lexeme: str, value: str | int | float | bool | None, line: int, column: int) -> None:
        self.tokens.append(Token(kind, lexeme, value, line, column))

    def tokenize(self) -> tuple[list[Token], list[dict[str, Any]]]:
        while self.i < len(self.source):
            char = self.peek()
            if char.isspace():
                self.advance()
                continue
            if char == "/" and self.peek(1) == "/":
                while self.peek() and self.peek() != "\n":
                    self.advance()
                continue
            if char == "/" and self.peek(1) == "*":
                self.advance()
                self.advance()
                while self.peek() and not (self.peek() == "*" and self.peek(1) == "/"):
                    self.advance()
                if self.peek():
                    self.advance()
                    self.advance()
                else:
                    self.diagnostics.append(
                        diag("LEX-002", "error", "Unterminated block comment", "lexical")
                    )
                continue
            line, column = self.line, self.column
            if char.isalpha() or char == "_":
                text = ""
                while self.peek().isalnum() or self.peek() == "_":
                    text += self.advance()
                kind = "KEYWORD" if text in KEYWORDS else "IDENT"
                value: str | int | float | bool | None
                value = text if kind == "IDENT" else None
                self.add(kind, text, value, line, column)
                continue
            if char.isdigit():
                text = ""
                while self.peek().isdigit():
                    text += self.advance()
                if self.peek() == "." and self.peek(1).isdigit():
                    text += self.advance()
                    while self.peek().isdigit():
                        text += self.advance()
                    self.add("NUMBER", text, float(text), line, column)
                else:
                    self.add("NUMBER", text, int(text), line, column)
                continue
            if char == '"':
                self.advance()
                text = ""
                closed = False
                while self.peek():
                    if self.peek() == '"':
                        self.advance()
                        closed = True
                        break
                    if self.peek() == "\\":
                        self.advance()
                        escaped = self.advance()
                        text += {
                            "n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "0": "\0",
                        }.get(escaped, escaped)
                    else:
                        text += self.advance()
                if not closed:
                    self.diagnostics.append(
                        diag("LEX-003", "error", "Unterminated string literal", "lexical",
                             {"start_line": line, "start_column": column, "end_line": self.line,
                              "end_column": self.column})
                    )
                self.add("STRING", f'"{text}"', text, line, column)
                continue
            two = char + self.peek(1)
            if two in {"==", "!=", "<=", ">="}:
                self.advance()
                self.advance()
                self.add("OP", two, None, line, column)
                continue
            if char in "+-*/%=<>":
                self.advance()
                self.add("OP", char, None, line, column)
                continue
            if char in "()[]{};,":
                self.advance()
                self.add("PUNCT", char, None, line, column)
                continue
            self.advance()
            self.diagnostics.append(
                diag("LEX-001", "error", f"Unexpected character '{char}'", "lexical",
                     {"start_line": line, "start_column": column, "end_line": line,
                      "end_column": column + 1})
            )
        self.tokens.append(Token("EOF", "<eof>", None, self.line, self.column))
        return self.tokens, self.diagnostics


@dataclass
class Node:
    kind: str
    span: dict[str, int]
    props: dict[str, Any] = field(default_factory=dict)
    children: list["Node"] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"kind": self.kind, "span": self.span}
        result.update(self.props)
        result["children"] = [child.to_dict() for child in self.children]
        return result


def node_span(*nodes: Node) -> dict[str, int]:
    if not nodes:
        return empty_span()
    return {
        "start_line": min(item.span["start_line"] for item in nodes),
        "start_column": min(item.span["start_column"] for item in nodes),
        "end_line": max(item.span["end_line"] for item in nodes),
        "end_column": max(item.span["end_column"] for item in nodes),
    }


STOPPERS = {"STOP", "ENDIF", "ELSE", "ENDWHILE", "ENDFUNCTION", "EOF"}


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0
        self.diagnostics: list[dict[str, Any]] = []

    def peek(self, offset: int = 0) -> Token:
        index = min(self.pos + offset, len(self.tokens) - 1)
        return self.tokens[index]

    def advance(self) -> Token:
        token = self.peek()
        if token.kind != "EOF":
            self.pos += 1
        return token

    def check(self, lexeme: str) -> bool:
        return self.peek().lexeme == lexeme

    def accept(self, lexeme: str) -> Token | None:
        if self.check(lexeme):
            return self.advance()
        return None

    def expect(self, lexeme: str) -> Token:
        if self.check(lexeme):
            return self.advance()
        token = self.peek()
        self.diagnostics.append(
            diag("SYN-001", "error", f"Expected '{lexeme}' but found '{token.lexeme}'", "syntax",
                 token.span, f"Insert '{lexeme}' here.")
        )
        return Token("SYNTH", lexeme, None, token.start_line, token.start_column)

    def parse_program(self) -> Node:
        start = self.expect("START")
        statements = self.parse_statement_list()
        stop = self.expect("STOP")
        return Node(
            "Program",
            {"start_line": start.start_line, "start_column": start.start_column,
             "end_line": stop.start_line, "end_column": stop.start_column + len(stop.lexeme)},
            children=statements,
        )

    def parse_statement_list(self) -> list[Node]:
        statements: list[Node] = []
        while self.peek().lexeme not in STOPPERS and self.peek().kind != "EOF":
            before = self.pos
            statement = self.parse_statement()
            if statement is not None:
                statements.append(statement)
            if self.pos == before:
                self.advance()
        return statements

    def parse_statement(self) -> Node | None:
        token = self.peek()
        if token.lexeme in TYPES:
            return self.parse_declaration()
        if token.lexeme == "IF":
            return self.parse_if()
        if token.lexeme == "WHILE":
            return self.parse_while()
        if token.lexeme == "FUNCTION":
            return self.parse_function()
        if token.lexeme == "RETURN":
            self.advance()
            expr = self.parse_expression()
            semi = self.expect(";")
            return Node("Return", node_span(token, semi), {"expr": expr}, [expr])
        if token.lexeme == "PRINT":
            self.advance()
            expr = self.parse_expression()
            semi = self.expect(";")
            return Node("Print", node_span(token, semi), {"expr": expr}, [expr])
        if token.lexeme == "INPUT":
            self.advance()
            name = self.expect_ident()
            semi = self.expect(";")
            target = Node("Variable", name.span, {"name": name.lexeme})
            return Node("Input", node_span(token, semi), {"target": target}, [target])
        if token.lexeme == "{":
            opening = self.advance()
            statements = self.parse_statement_list_until("}")
            closing = self.expect("}")
            return Node("Block", node_span(opening, closing), children=statements)
        if token.lexeme == ";":
            self.advance()
            return None
        if token.kind == "IDENT" and self.is_assignment():
            return self.parse_assignment()
        expr = self.parse_expression()
        semi = self.expect(";")
        return Node("ExprStmt", node_span(token, semi), {"expr": expr}, [expr])

    def is_assignment(self) -> bool:
        depth = 0
        offset = 0
        while True:
            token = self.peek(offset)
            if token.kind == "EOF" or token.lexeme == ";":
                return False
            if token.lexeme == "[":
                depth += 1
            elif token.lexeme == "]":
                depth -= 1
            elif token.lexeme == "=" and depth == 0:
                return True
            offset += 1

    def parse_assignment(self) -> Node:
        name = self.expect_ident()
        index: Node | None = None
        if self.accept("["):
            index = self.parse_expression()
            self.expect("]")
        self.expect("=")
        value = self.parse_expression()
        semi = self.expect(";")
        children = [item for item in (index, value) if item is not None]
        return Node(
            "Assign", node_span(name, semi),
            {"name": name.lexeme, "index": index, "expr": value},
            children,
        )

    def parse_statement_list_until(self, stop: str) -> list[Node]:
        statements: list[Node] = []
        while not self.check(stop) and self.peek().kind != "EOF":
            before = self.pos
            statement = self.parse_statement()
            if statement is not None:
                statements.append(statement)
            if self.pos == before:
                self.advance()
        return statements

    def expect_ident(self) -> Token:
        token = self.peek()
        if token.kind == "IDENT":
            return self.advance()
        self.diagnostics.append(
            diag("SYN-002", "error", f"Expected an identifier but found '{token.lexeme}'",
                 "syntax", token.span)
        )
        return Token("IDENT", "<missing>", None, token.start_line, token.start_column)

    def parse_declaration(self) -> Node:
        type_token = self.advance()
        name = self.expect_ident()
        array_size: Node | None = None
        if self.accept("["):
            array_size = self.parse_expression()
            self.expect("]")
        initializer: Node | None = None
        if self.accept("="):
            initializer = self.parse_expression()
        semi = self.expect(";")
        children = [item for item in (array_size, initializer) if item is not None]
        return Node(
            "Decl",
            node_span(type_token, semi),
            {
                "name": name.lexeme,
                "type_name": type_token.lexeme,
                "array_size": array_size,
                "initializer": initializer,
                "name_span": name.span,
            },
            children,
        )

    def parse_if(self) -> Node:
        keyword = self.advance()
        condition = self.parse_expression()
        self.accept("THEN")
        then_body = self.parse_statement_list()
        else_body: list[Node] = []
        if self.accept("ELSE"):
            else_body = self.parse_statement_list()
        end = self.expect("ENDIF")
        return Node(
            "If",
            node_span(keyword, end),
            {"condition": condition, "then_body": then_body, "else_body": else_body},
            [condition, *then_body, *else_body],
        )

    def parse_while(self) -> Node:
        keyword = self.advance()
        condition = self.parse_expression()
        body = self.parse_statement_list()
        end = self.expect("ENDWHILE")
        return Node(
            "While", node_span(keyword, end),
            {"condition": condition, "body": body}, [condition, *body],
        )

    def parse_function(self) -> Node:
        keyword = self.advance()
        name = self.expect_ident()
        self.expect("(")
        parameters: list[dict[str, Any]] = []
        if not self.check(")"):
            while True:
                param_type = self.peek().lexeme if self.peek().lexeme in TYPES else None
                if param_type:
                    self.advance()
                param_name = self.expect_ident()
                parameters.append({
                    "name": param_name.lexeme,
                    "type_name": param_type or "INT",
                    "span": param_name.span,
                })
                if not self.accept(","):
                    break
        self.expect(")")
        body = self.parse_statement_list()
        end = self.expect("ENDFUNCTION")
        return Node(
            "Function", node_span(keyword, end),
            {"name": name.lexeme, "parameters": parameters, "body": body}, body,
        )

    def parse_expression(self) -> Node:
        return self.parse_or()

    def parse_or(self) -> Node:
        node = self.parse_and()
        while self.check("OR"):
            operator = self.advance()
            right = self.parse_and()
            node = Node("Binary", node_span(node, right),
                        {"op": "OR", "left": node, "right": right}, [node, right])
        return node

    def parse_and(self) -> Node:
        node = self.parse_not()
        while self.check("AND"):
            operator = self.advance()
            right = self.parse_not()
            node = Node("Binary", node_span(node, right),
                        {"op": "AND", "left": node, "right": right}, [node, right])
        return node

    def parse_not(self) -> Node:
        if self.check("NOT"):
            operator = self.advance()
            operand = self.parse_not()
            return Node("Unary", node_span(operator, operand),
                        {"op": "NOT", "operand": operand}, [operand])
        return self.parse_comparison()

    def parse_comparison(self) -> Node:
        node = self.parse_additive()
        while self.peek().lexeme in COMPARISONS:
            operator = self.advance()
            right = self.parse_additive()
            node = Node("Binary", node_span(node, right),
                        {"op": operator.lexeme, "left": node, "right": right}, [node, right])
        return node

    def parse_additive(self) -> Node:
        node = self.parse_multiplicative()
        while self.peek().lexeme in {"+", "-"}:
            operator = self.advance()
            right = self.parse_multiplicative()
            node = Node("Binary", node_span(node, right),
                        {"op": operator.lexeme, "left": node, "right": right}, [node, right])
        return node

    def parse_multiplicative(self) -> Node:
        node = self.parse_unary()
        while self.peek().lexeme in {"*", "/", "%"}:
            operator = self.advance()
            right = self.parse_unary()
            node = Node("Binary", node_span(node, right),
                        {"op": operator.lexeme, "left": node, "right": right}, [node, right])
        return node

    def parse_unary(self) -> Node:
        if self.check("-"):
            operator = self.advance()
            operand = self.parse_unary()
            return Node("Unary", node_span(operator, operand),
                        {"op": "-", "operand": operand}, [operand])
        return self.parse_primary()

    def parse_primary(self) -> Node:
        token = self.peek()
        if token.kind == "NUMBER":
            self.advance()
            return Node("Number", token.span, {"value": token.value})
        if token.kind == "STRING":
            self.advance()
            return Node("String", token.span, {"value": token.value})
        if token.lexeme in {"TRUE", "FALSE"}:
            self.advance()
            return Node("Boolean", token.span, {"value": token.lexeme == "TRUE"})
        if self.accept("("):
            inner = self.parse_expression()
            self.expect(")")
            return inner
        if token.kind == "IDENT":
            name = self.advance()
            if self.accept("("):
                arguments: list[Node] = []
                if not self.check(")"):
                    while True:
                        arguments.append(self.parse_expression())
                        if not self.accept(","):
                            break
                closing = self.expect(")")
                return Node("Call", node_span(name, closing),
                            {"name": name.lexeme, "args": arguments}, arguments)
            if self.accept("["):
                index = self.parse_expression()
                closing = self.expect("]")
                return Node("ArrayAccess", node_span(name, closing),
                            {"name": name.lexeme, "index": index}, [index])
            return Node("Variable", name.span, {"name": name.lexeme})
        self.advance()
        self.diagnostics.append(
            diag("SYN-003", "error", f"Unexpected token '{token.lexeme}' in expression",
                 "syntax", token.span)
        )
        return Node("Number", token.span, {"value": 0})


def pt_node(symbol: str, production: str, span: dict[str, int], children: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "symbol": symbol,
        "node_kind": "nonterminal",
        "production": production,
        "span": span,
        "children": children,
    }


def pt_terminal(lexeme: str, span: dict[str, int]) -> dict[str, Any]:
    return {"symbol": lexeme, "node_kind": "terminal", "production": None, "span": span, "children": []}


def build_parse_tree(program: Node) -> dict[str, Any]:
    span = program.span
    start = {
        "start_line": span["start_line"],
        "start_column": span["start_column"],
        "end_line": span["start_line"],
        "end_column": span["start_column"] + 5,
    }
    stop = {
        "start_line": span["end_line"],
        "start_column": max(1, span["end_column"] - 4),
        "end_line": span["end_line"],
        "end_column": span["end_column"],
    }
    return pt_node(
        "program", "program -> START stmt_list STOP", span,
        [
            pt_terminal("START", start),
            pt_node("stmt_list", "stmt_list -> stmt_list stmt | ε", span,
                    [statement_tree(child) for child in program.children]),
            pt_terminal("STOP", stop),
        ],
    )


STATEMENT_PRODUCTIONS = {
    "Decl": "stmt -> type IDENT '=' expr ';'",
    "Assign": "stmt -> IDENT '=' expr ';'",
    "ExprStmt": "stmt -> expr ';'",
    "Print": "stmt -> PRINT expr ';'",
    "Input": "stmt -> INPUT IDENT ';'",
    "If": "stmt -> IF expr stmt_list ELSE stmt_list ENDIF",
    "While": "stmt -> WHILE expr stmt_list ENDWHILE",
    "Function": "stmt -> FUNCTION IDENT '(' params ')' stmt_list ENDFUNCTION",
    "Return": "stmt -> RETURN expr ';'",
    "Block": "stmt -> '{' stmt_list '}'",
}


def statement_tree(node: Node) -> dict[str, Any]:
    symbol = {
        "Decl": "decl", "Print": "print", "If": "if", "While": "while",
        "Function": "function", "Return": "return", "Input": "input", "Block": "block",
    }.get(node.kind, "stmt")
    children = [expression_tree(child) for child in node.children]
    return pt_node(symbol, STATEMENT_PRODUCTIONS.get(node.kind, "stmt -> expr ';'"), node.span, children)


def expression_tree(node: Node) -> dict[str, Any]:
    if node.kind == "Binary":
        production = f"expr -> expr '{node.props['op']}' expr"
    elif node.kind == "Unary":
        production = f"expr -> '{node.props['op']}' expr"
    elif node.kind == "Call":
        production = "expr -> IDENT '(' args ')'"
    elif node.kind == "ArrayAccess":
        production = "expr -> IDENT '[' expr ']'"
    elif node.kind == "Variable":
        production = "expr -> IDENT"
    elif node.kind == "Number":
        production = "expr -> NUMBER"
    elif node.kind == "String":
        production = "expr -> STRING"
    elif node.kind == "Boolean":
        production = "expr -> BOOL_LITERAL"
    else:
        production = "expr -> expr"
    return pt_node("expr", production, node.span,
                   [expression_tree(child) for child in node.children])


@dataclass
class Symbol:
    name: str
    category: str
    declared_type: str
    scope: str
    declaration_span: dict[str, int]
    parameters: list[dict[str, Any]] = field(default_factory=list)
    array_size: int | None = None
    has_initializer: bool = False
    runtime_value: str | int | float | bool | None = None
    has_runtime_value: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "declared_type": self.declared_type,
            "scope": self.scope,
            "declaration_span": self.declaration_span,
            "parameters": self.parameters,
            "array_size": self.array_size,
            "has_initializer": self.has_initializer,
            "runtime_value": self.runtime_value,
            "has_runtime_value": self.has_runtime_value,
        }


@dataclass
class Scope:
    name: str
    kind: str
    depth: int
    symbols: dict[str, Symbol] = field(default_factory=dict)
    children: list["Scope"] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind,
            "depth": self.depth,
            "symbols": [symbol.as_dict() for symbol in self.symbols.values()],
            "children": [child.as_dict() for child in self.children],
        }


class SemanticAnalyzer:
    def __init__(self) -> None:
        self.global_scope = Scope("global", "program", 0)
        self.scope = self.global_scope
        self.diagnostics: list[dict[str, Any]] = []
        self.functions: dict[str, list[dict[str, Any]]] = {}
        self.in_function: str | None = None
        self.saw_return: dict[str, bool] = {}

    def error(self, code: str, message: str, node: Node, hint: str | None = None) -> None:
        self.diagnostics.append(diag(code, "error", message, "semantic", node.span, hint))

    def lookup(self, name: str) -> Symbol | None:
        scope: Scope | None = self.scope
        while scope is not None:
            if name in scope.symbols:
                return scope.symbols[name]
            scope = scope.parent if hasattr(scope, "parent") else None
        return None

    def analyze(self, program: Node) -> dict[str, Any]:
        for child in program.children:
            if child.kind == "Function":
                name = child.props["name"]
                params = child.props["parameters"]
                self.functions[name] = params
                if name in self.global_scope.symbols:
                    self.error("SEM-001", f"Duplicate declaration of '{name}'", child)
                self.global_scope.symbols[name] = Symbol(
                    name=name, category="function", declared_type="FUNC",
                    scope="global", declaration_span=child.span, parameters=params,
                )
        for child in program.children:
            self.visit_statement(child)
        return {"global_scope": self.global_scope.as_dict()}

    def visit_statement(self, node: Node) -> None:
        if node.kind == "Decl":
            name = node.props["name"]
            if name in self.scope.symbols:
                self.error("SEM-001", f"Duplicate declaration of '{name}' in this scope", node)
            declared_type = node.props["type_name"]
            size: int | None = None
            array_size = node.props.get("array_size")
            if array_size is not None:
                size_value = self.static_int(array_size)
                if size_value is not None and size_value <= 0:
                    self.error("SEM-004", "Array size must be positive", array_size)
                size = size_value
            initializer = node.props.get("initializer")
            if initializer is not None:
                self.visit_expression(initializer)
                actual = self.expr_type(initializer)
                if actual and declared_type != actual:
                    self.error(
                        "SEM-002",
                        f"Cannot assign {actual} to {declared_type} variable '{name}'",
                        initializer,
                        f"Declare '{name}' as {actual} or convert the value.",
                    )
            self.scope.symbols[name] = Symbol(
                name=name,
                category="variable",
                declared_type=declared_type,
                scope=self.scope.name,
                declaration_span=node.props.get("name_span", node.span),
                array_size=size,
                has_initializer=initializer is not None,
            )
        elif node.kind == "Print":
            self.visit_expression(node.props["expr"])
        elif node.kind == "Input":
            target = node.props["target"]
            symbol = self.lookup(target.props["name"])
            if symbol is None:
                self.error("SEM-003", f"Undeclared variable '{target.props['name']}'", target)
        elif node.kind == "Assign":
            name = node.props["name"]
            if node.props.get("index") is not None:
                self.visit_expression(node.props["index"])
                array = self.lookup(name)
                if array is None:
                    self.error("SEM-003", f"Undeclared array '{name}'", node)
                elif array.array_size is None:
                    self.error("SEM-007", f"'{name}' is not an array", node)
            else:
                symbol = self.lookup(name)
                if symbol is None:
                    self.error("SEM-003", f"Undeclared variable '{name}'", node)
                elif symbol.category == "function":
                    self.error("SEM-010", f"'{name}' is a function and cannot be assigned", node)
            self.visit_expression(node.props["expr"])
        elif node.kind in {"ExprStmt", "Return"}:
            if node.kind == "Return":
                if self.in_function is None:
                    self.error("SEM-006", "RETURN outside a function", node)
                else:
                    self.saw_return[self.in_function] = True
            expression = node.props.get("expr")
            if expression is not None:
                self.visit_expression(expression)
        elif node.kind == "If":
            self.visit_expression(node.props["condition"])
            if self.expr_type(node.props["condition"]) not in (None, "BOOL"):
                self.error("SEM-005", "IF condition must be BOOL", node.props["condition"])
            for child in node.props["then_body"]:
                self.visit_statement(child)
            for child in node.props["else_body"]:
                self.visit_statement(child)
        elif node.kind == "While":
            self.visit_expression(node.props["condition"])
            if self.expr_type(node.props["condition"]) not in (None, "BOOL"):
                self.error("SEM-005", "WHILE condition must be BOOL", node.props["condition"])
            for child in node.props["body"]:
                self.visit_statement(child)
        elif node.kind == "Function":
            previous = self.scope
            function_scope = Scope(node.props["name"], "function", previous.depth + 1)
            function_scope.parent = previous  # type: ignore[attr-defined]
            previous.children.append(function_scope)
            self.scope = function_scope
            self.in_function = node.props["name"]
            self.saw_return[node.props["name"]] = False
            for parameter in node.props["parameters"]:
                function_scope.symbols[parameter["name"]] = Symbol(
                    name=parameter["name"], category="parameter",
                    declared_type=parameter["type_name"], scope=function_scope.name,
                    declaration_span=parameter["span"],
                )
            for child in node.props["body"]:
                self.visit_statement(child)
            self.scope = previous
            self.in_function = None
        elif node.kind == "Block":
            for child in node.children:
                self.visit_statement(child)

    def visit_expression(self, node: Node | None) -> None:
        if node is None:
            return
        if node.kind == "Binary":
            self.visit_expression(node.props["left"])
            self.visit_expression(node.props["right"])
        elif node.kind == "Unary":
            self.visit_expression(node.props["operand"])
        elif node.kind == "Variable":
            if self.lookup(node.props["name"]) is None:
                self.error("SEM-003", f"Undeclared variable '{node.props['name']}'", node)
        elif node.kind == "ArrayAccess":
            self.visit_expression(node.props["index"])
            symbol = self.lookup(node.props["name"])
            if symbol is None:
                self.error("SEM-003", f"Undeclared array '{node.props['name']}'", node)
            elif symbol.array_size is None:
                self.error("SEM-007", f"'{node.props['name']}' is not an array", node)
        elif node.kind == "Call":
            name = node.props["name"]
            if name not in self.functions:
                self.error("SEM-008", f"Unknown function '{name}'", node)
            else:
                expected = len(self.functions[name])
                if len(node.props["args"]) != expected:
                    self.error(
                        "SEM-009",
                        f"Function '{name}' expects {expected} argument(s), got {len(node.props['args'])}",
                        node,
                    )
            for argument in node.props["args"]:
                self.visit_expression(argument)

    def static_int(self, node: Node) -> int | None:
        if node.kind == "Number" and isinstance(node.props["value"], int):
            return int(node.props["value"])
        return None

    def expr_type(self, node: Node | None) -> str | None:
        if node is None:
            return None
        if node.kind == "Number":
            return "FLOAT" if isinstance(node.props["value"], float) else "INT"
        if node.kind == "String":
            return "STRING"
        if node.kind == "Boolean":
            return "BOOL"
        if node.kind == "Variable":
            symbol = self.lookup(node.props["name"])
            return symbol.declared_type if symbol else None
        if node.kind == "ArrayAccess":
            symbol = self.lookup(node.props["name"])
            return symbol.declared_type if symbol else None
        if node.kind == "Call":
            return "INT"
        if node.kind == "Unary":
            return "BOOL" if node.props["op"] == "NOT" else self.expr_type(node.props["operand"])
        if node.kind == "Binary":
            op = node.props["op"]
            if op in COMPARISONS or op in {"AND", "OR"}:
                return "BOOL"
            return self.expr_type(node.props["left"]) or self.expr_type(node.props["right"])
        return None


class TacGenerator:
    def __init__(self, span_for_statement: bool = True) -> None:
        self.lines: list[dict[str, Any]] = []
        self.temp_index = 0
        self.label_index = 0
        self.span_for_statement = span_for_statement
        self.span_stack: list[dict[str, int]] = []

    def temp(self) -> str:
        self.temp_index += 1
        return f"t{self.temp_index}"

    def label(self, prefix: str) -> str:
        self.label_index += 1
        return f"L{self.label_index}_{prefix}"

    def emit(self, opcode: str, text: str, span: dict[str, int] | None = None) -> None:
        self.lines.append({
            "index": len(self.lines) + 1,
            "text": text,
            "opcode": opcode,
            "span": span or (self.span_stack[-1] if self.span_stack else empty_span()),
        })

    def generate(self, program: Node) -> list[dict[str, Any]]:
        self.emit("PROC", "START", program.span)
        self.statements(program.children)
        self.emit("HALT", "STOP", program.span)
        return self.lines

    def statements(self, statements: list[Node]) -> None:
        for statement in statements:
            self.statement(statement)

    def statement(self, node: Node) -> None:
        self.span_stack.append(node.span)
        kind = node.kind
        if kind == "Decl":
            initializer = node.props.get("initializer")
            array_size = node.props.get("array_size")
            if array_size is not None:
                size = self.expression(array_size)
                self.emit("ALLOC", f"{node.props['name']} = new {size}", node.span)
            if initializer is not None:
                value = self.expression(initializer)
                self.emit("STORE", f"{node.props['name']} = {value}", node.span)
            else:
                self.emit("STORE", f"{node.props['name']} = uninitialized", node.span)
        elif kind == "ExprStmt":
            self.expression(node.props["expr"])
        elif kind == "Assign":
            value = self.expression(node.props["expr"])
            index = node.props.get("index")
            if index is not None:
                index_value = self.expression(index)
                self.emit("STORE", f"{node.props['name']}[{index_value}] = {value}", node.span)
            else:
                self.emit("STORE", f"{node.props['name']} = {value}", node.span)
        elif kind == "Print":
            value = self.expression(node.props["expr"])
            self.emit("PRINT", f"PRINT {value}", node.span)
        elif kind == "Input":
            self.emit("READ", f"READ {node.props['target'].props['name']}", node.span)
        elif kind == "Return":
            value = self.expression(node.props["expr"])
            self.emit("RETURN", f"RETURN {value}", node.span)
        elif kind == "If":
            condition = self.expression(node.props["condition"])
            else_label = self.label("else")
            end_label = self.label("end")
            self.emit("BRF", f"IF_FALSE {condition} GOTO {else_label}", node.span)
            self.statements(node.props["then_body"])
            self.emit("BR", f"GOTO {end_label}", node.span)
            self.emit("LABEL", f"{else_label}:", node.span)
            self.statements(node.props["else_body"])
            self.emit("LABEL", f"{end_label}:", node.span)
        elif kind == "While":
            start_label = self.label("while")
            end_label = self.label("end")
            self.emit("LABEL", f"{start_label}:", node.span)
            condition = self.expression(node.props["condition"])
            self.emit("BRF", f"IF_FALSE {condition} GOTO {end_label}", node.span)
            self.statements(node.props["body"])
            self.emit("BR", f"GOTO {start_label}", node.span)
            self.emit("LABEL", f"{end_label}:", node.span)
        elif kind == "Function":
            self.emit("FUNC", f"FUNCTION {node.props['name']}({', '.join(p['name'] for p in node.props['parameters'])})", node.span)
            self.statements(node.props["body"])
            self.emit("ENDFUNC", "ENDFUNCTION", node.span)
        elif kind == "Block":
            self.statements(node.children)
        self.span_stack.pop()

    def expression(self, node: Node) -> str:
        kind = node.kind
        if kind == "Number":
            return str(node.props["value"])
        if kind == "String":
            escaped = str(node.props["value"]).replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        if kind == "Boolean":
            return "TRUE" if node.props["value"] else "FALSE"
        if kind == "Variable":
            return str(node.props["name"])
        if kind == "ArrayAccess":
            index = self.expression(node.props["index"])
            return f"{node.props['name']}[{index}]"
        if kind == "Call":
            args = [self.expression(arg) for arg in node.props["args"]]
            target = self.temp()
            self.emit("CALL", f"{target} = CALL {node.props['name']}({', '.join(args)})", node.span)
            return target
        if kind == "Unary":
            operand = self.expression(node.props["operand"])
            target = self.temp()
            opcode = "NOT" if node.props["op"] == "NOT" else "NEG"
            self.emit(opcode, f"{target} = {node.props['op']} {operand}", node.span)
            return target
        if kind == "Binary":
            left = self.expression(node.props["left"])
            right = self.expression(node.props["right"])
            target = self.temp()
            opcode = {
                "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", "%": "MOD",
                "==": "EQ", "!=": "NE", "<": "LT", "<=": "LE", ">": "GT", ">=": "GE",
                "AND": "AND", "OR": "OR",
            }.get(str(node.props["op"]), "OP")
            self.emit(opcode, f"{target} = {left} {node.props['op']} {right}", node.span)
            return target
        return "0"


def optimize_tac(lines: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    result = deepcopy(lines)
    constants_folded = 0

    for line in result:
        parts = line["text"].split(" = ", 1)
        if len(parts) != 2:
            continue
        target, expression = parts
        if not target.startswith("t"):
            continue
        pieces = expression.split(" ")
        if len(pieces) == 3 and pieces[0].replace(".", "", 1).isdigit() and pieces[2].replace(".", "", 1).isdigit():
            try:
                left, right = float(pieces[0]), float(pieces[2])
                op = pieces[1]
                value = {
                    "+": left + right, "-": left - right, "*": left * right,
                    "/": left / right if right else None, "%": left % right if right else None,
                }.get(op)
                if value is not None:
                    folded = str(int(value)) if value.is_integer() else str(value)
                    line["text"] = f"{target} = {folded}"
                    line["opcode"] = "CONST"
                    constants_folded += 1
            except (ValueError, ZeroDivisionError, AttributeError):
                pass

    before = len(result)
    removable: set[int] = set()
    for index, line in enumerate(result[:-1]):
        if line["opcode"] == "BR":
            label = line["text"].removeprefix("GOTO ").strip()
            if result[index + 1]["opcode"] == "LABEL" and result[index + 1]["text"].removeprefix("L") == label.removeprefix("L"):
                removable.add(index)
    result = [line for index, line in enumerate(result) if index not in removable]
    for index, line in enumerate(result):
        line["index"] = index + 1

    def count(opcode: str) -> int:
        return sum(1 for line in result if line["opcode"] == opcode)

    stats = {
        "instructions_before": before,
        "instructions_after": len(result),
        "temps_before": count("ADD") + count("SUB") + count("MUL") + count("DIV") + count("MOD"),
        "temps_after": count("CONST") + count("ADD") + count("SUB") + count("MUL") + count("DIV") + count("MOD"),
        "labels_before": sum(1 for line in lines if line["opcode"] == "LABEL"),
        "labels_after": count("LABEL"),
        "constants_folded": constants_folded,
        "instructions_removed": len(removable),
        "passes": 2,
        "instructions_saved": before - len(result),
    }
    return result, stats


class ReturnSignal(Exception):
    def __init__(self, value: Any) -> None:
        super().__init__("return")
        self.value = value


@dataclass
class Frame:
    name: str
    variables: dict[str, dict[str, Any]] = field(default_factory=dict)
    arrays: dict[str, dict[str, Any]] = field(default_factory=dict)


def format_value(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if value is None:
        return "uninitialized"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


class Interpreter:
    def __init__(self, program: Node, inputs: list[str] | None = None) -> None:
        self.program = program
        self.functions: dict[str, Node] = {
            child.props["name"]: child for child in program.children if child.kind == "Function"
        }
        self.inputs = list(inputs or [])
        self.input_index = 0
        self.frames: list[Frame] = [Frame("global")]
        self.output: list[str] = []
        self.diagnostics: list[dict[str, Any]] = []
        self.snapshots: list[dict[str, Any]] = []
        self.steps = 0
        self.halted = False

    @property
    def frame(self) -> Frame:
        return self.frames[-1]

    def lookup_variable(self, name: str) -> dict[str, Any]:
        for frame in reversed(self.frames):
            if name in frame.variables:
                return frame.variables[name]
        raise RuntimeError(f"Undeclared variable '{name}'")

    def lookup_array(self, name: str) -> dict[str, Any]:
        for frame in reversed(self.frames):
            if name in frame.arrays:
                return frame.arrays[name]
        raise RuntimeError(f"Undeclared array '{name}'")

    def runtime_state(self) -> dict[str, Any]:
        variables: list[dict[str, Any]] = []
        arrays: list[dict[str, Any]] = []
        for frame in self.frames:
            for entry in frame.variables.values():
                variables.append(deepcopy(entry))
            for entry in frame.arrays.values():
                arrays.append(deepcopy(entry))
        return {
            "variables": variables,
            "arrays": arrays,
            "temps": {},
            "output": list(self.output),
            "call_stack": [frame.name for frame in self.frames],
            "steps": self.steps,
            "halted": self.halted,
        }

    def snapshot(self, event: str, opcode: str | None, span: dict[str, int] | None) -> None:
        self.snapshots.append({
            "index": len(self.snapshots) + 1,
            "pc": len(self.snapshots) + 1,
            "opcode": opcode,
            "span": span or empty_span(),
            "event": event,
            "state": self.runtime_state(),
            "diagnostics": list(self.diagnostics),
            "call_depth": len(self.frames) - 1,
        })

    def run(self) -> dict[str, Any]:
        self.snapshot("program.start", "PROC", self.program.span)
        try:
            for statement in self.program.children:
                if self.halted:
                    break
                self.execute(statement)
        except ReturnSignal:
            self.diagnostics.append(
                diag("RTE-004", "error", "RETURN outside a function", "runtime", self.program.span)
            )
            self.halted = True
        except RuntimeError as error:
            self.diagnostics.append(diag("RTE-001", "error", str(error), "runtime"))
            self.halted = True
        self.snapshot("program.end", "HALT", self.program.span)
        return {
            "output": list(self.output),
            "diagnostics": list(self.diagnostics),
            "steps": self.steps,
            "state": self.runtime_state(),
            "halted": self.halted,
            "success": not self.halted,
        }

    def execute(self, node: Node) -> None:
        self.steps += 1
        kind = node.kind
        opcode = {
            "Decl": "DECL", "ExprStmt": "STORE", "Print": "PRINT", "Input": "READ",
            "If": "BRANCH", "While": "LOOP", "Return": "RETURN", "Function": "FUNC",
            "Block": "BLOCK",
        }.get(kind, "OP")
        self.snapshot(f"before:{kind}", opcode, node.span)

        if kind == "Function":
            return
        if kind == "Decl":
            self.declare(node)
        elif kind == "ExprStmt":
            self.evaluate(node.props["expr"])
        elif kind == "Assign":
            self.evaluate(node)
        elif kind == "Print":
            value = self.evaluate(node.props["expr"])
            self.output.append(format_value(value))
        elif kind == "Input":
            name = node.props["target"].props["name"]
            variable = self.lookup_variable(name)
            if self.input_index >= len(self.inputs):
                raise RuntimeError(f"No input available for INPUT {name}")
            raw = self.inputs[self.input_index]
            self.input_index += 1
            variable["value"] = convert_input(raw, variable["type_name"])
            variable["initialized"] = True
            variable["has_runtime_value"] = True
        elif kind == "If":
            condition = self.evaluate(node.props["condition"])
            body = node.props["then_body"] if truthy(condition) else node.props["else_body"]
            for statement in body:
                self.execute(statement)
        elif kind == "While":
            guard = 0
            while truthy(self.evaluate(node.props["condition"])):
                guard += 1
                if guard > 100000:
                    raise RuntimeError("Loop exceeded 100000 iterations (possible infinite loop)")
                self.snapshot("loop.iteration", "LOOP", node.span)
                for statement in node.props["body"]:
                    self.execute(statement)
                if self.halted:
                    break
        elif kind == "Return":
            raise ReturnSignal(self.evaluate(node.props["expr"]))
        elif kind == "Block":
            for statement in node.children:
                self.execute(statement)
        self.snapshot(f"after:{kind}", opcode, node.span)

    def declare(self, node: Node) -> None:
        name = node.props["name"]
        type_name = node.props["type_name"]
        array_size = node.props.get("array_size")
        if array_size is not None:
            size = int(self.evaluate(array_size))
            if size < 0:
                raise RuntimeError(f"Invalid array size {size} for '{name}'")
            self.frame.arrays[name] = {
                "name": name,
                "scope": self.frame.name,
                "type_name": type_name,
                "elements": [
                    {"type_name": type_name, "value": None, "initialized": False} for _ in range(size)
                ],
            }
            return
        value: Any = None
        initialized = False
        initializer = node.props.get("initializer")
        if initializer is not None:
            value = self.evaluate(initializer)
            initialized = True
        self.frame.variables[name] = {
            "name": name,
            "scope": self.frame.name,
            "type_name": type_name,
            "value": value,
            "initialized": initialized,
            "has_runtime_value": initialized,
        }

    def evaluate(self, node: Node | None) -> Any:
        if node is None:
            return None
        kind = node.kind
        if kind in {"Number", "String", "Boolean"}:
            return node.props["value"]
        if kind == "Variable":
            target = node.props["name"]
            for frame in reversed(self.frames):
                if target in frame.variables:
                    variable = frame.variables[target]
                    if not variable["initialized"]:
                        raise RuntimeError(f"Variable '{target}' used before initialization")
                    return variable["value"]
            if target in self.functions:
                raise RuntimeError(f"'{target}' is a function, not a variable")
            raise RuntimeError(f"Undeclared variable '{target}'")
        if kind == "ArrayAccess":
            array = self.lookup_array(node.props["name"])
            index = int(self.evaluate(node.props["index"]))
            if index < 0 or index >= len(array["elements"]):
                raise RuntimeError(f"Array index {index} out of bounds for '{array['name']}'")
            element = array["elements"][index]
            if not element["initialized"]:
                raise RuntimeError(f"Array element '{array['name']}[{index}]' is uninitialized")
            return element["value"]
        if kind == "Binary":
            op = node.props["op"]
            left = self.evaluate(node.props["left"])
            if op == "AND" and not truthy(left):
                return False
            if op == "OR" and truthy(left):
                return True
            right = self.evaluate(node.props["right"])
            return binary_operation(op, left, right)
        if kind == "Unary":
            operand = self.evaluate(node.props["operand"])
            if node.props["op"] == "NOT":
                return not truthy(operand)
            return -numeric(operand)
        if kind == "Call":
            name = node.props["name"]
            if name not in self.functions:
                raise RuntimeError(f"Unknown function '{name}'")
            function = self.functions[name]
            arguments = [self.evaluate(arg) for arg in node.props["args"]]
            parameters = function.props["parameters"]
            frame = Frame(name)
            for index, parameter in enumerate(parameters):
                value = arguments[index] if index < len(arguments) else None
                frame.variables[parameter["name"]] = {
                    "name": parameter["name"],
                    "scope": name,
                    "type_name": parameter["type_name"],
                    "value": value,
                    "initialized": True,
                    "has_runtime_value": True,
                }
            self.frames.append(frame)
            result: Any = None
            try:
                for statement in function.props["body"]:
                    self.execute(statement)
            except ReturnSignal as signal:
                result = signal.value
            finally:
                self.frames.pop()
            return result
        if kind == "Assign":
            name = node.props["name"]
            value = self.evaluate(node.props["expr"])
            index = node.props.get("index")
            if index is not None:
                position = int(self.evaluate(index))
                array = self.lookup_array(name)
                if position < 0 or position >= len(array["elements"]):
                    raise RuntimeError(f"Array index {position} out of bounds for '{name}'")
                array["elements"][position] = {
                    "type_name": array["type_name"],
                    "value": value,
                    "initialized": True,
                }
            else:
                variable = self.lookup_variable(name)
                variable["value"] = value
                variable["initialized"] = True
                variable["has_runtime_value"] = True
            return value
        raise RuntimeError(f"Unsupported expression '{kind}'")


def truthy(value: Any) -> bool:
    return bool(value)


def numeric(value: Any) -> float | int:
    # MiniLang treats BOOL as a numeric 1/0 when it appears in an arithmetic
    # or relational expression (e.g. `count >= 15 AND active`).
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    raise RuntimeError(f"Expected a numeric value but got {value!r}")


def binary_operation(op: str, left: Any, right: Any) -> Any:
    if op in {"+", "-", "*", "/", "%"}:
        if isinstance(left, str) and isinstance(right, str) and op == "+":
            return left + right
        a, b = numeric(left), numeric(right)
        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        if op == "/":
            if b == 0:
                raise RuntimeError("Division by zero")
            return a / b
        if b == 0:
            raise RuntimeError("Modulo by zero")
        return a % b
    if op == "AND":
        return truthy(left) and truthy(right)
    if op == "OR":
        return truthy(left) or truthy(right)
    if op in {"==", "!="}:
        equal = left == right
        return equal if op == "==" else not equal
    a, b = numeric(left), numeric(right)
    if op == "<":
        return a < b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    if op == ">=":
        return a >= b
    raise RuntimeError(f"Unsupported operator '{op}'")


def convert_input(raw: str, type_name: str) -> Any:
    try:
        if type_name == "INT":
            return int(raw.strip())
        if type_name == "FLOAT":
            return float(raw.strip())
        if type_name == "BOOL":
            return raw.strip().upper() in {"TRUE", "1", "YES"}
    except ValueError:
        return raw
    return raw


def compile_source(source: str) -> dict[str, Any]:
    tokens, lex_diagnostics = Lexer(source).tokenize()
    parser = Parser(tokens)
    program = parser.parse_program()
    syntax_diagnostics = parser.diagnostics
    parse_tree = build_parse_tree(program)

    analyzer = SemanticAnalyzer()
    try:
        symbol_table = analyzer.analyze(program)
        semantic_diagnostics = analyzer.diagnostics
        semantic_status = "error" if any(item["severity"] == "error" for item in semantic_diagnostics) else "success"
    except Exception as error:  # defensive: analysis must never break the API
        symbol_table = {"global_scope": Scope("global", "program", 0).as_dict()}
        semantic_diagnostics = [diag("SEM-000", "error", f"Semantic analysis failed: {error}", "semantic")]
        semantic_status = "error"

    raw_tac = TacGenerator().generate(program)
    optimized_tac, stats = optimize_tac(raw_tac)

    def phase(status: str, diagnostics: list[dict[str, Any]], data: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        return {"status": status, "diagnostics": diagnostics, "data": data, "reason": reason}

    all_diagnostics = [*lex_diagnostics, *syntax_diagnostics, *semantic_diagnostics]
    blocked = bool(lex_diagnostics or syntax_diagnostics)
    phases = {
        "lexical": phase("error" if lex_diagnostics else "success", lex_diagnostics,
                         {"tokens": [token.as_dict() for token in tokens]}),
        "syntax": phase("error" if syntax_diagnostics else "success", syntax_diagnostics,
                        {"parse_tree": parse_tree, "ast": program.to_dict()}),
        "semantic": phase(semantic_status, semantic_diagnostics, {"symbol_table": symbol_table}),
        "intermediate": phase("blocked" if blocked else "success", [], {"tac": raw_tac},
                              "Lexical or syntax errors blocked this phase." if blocked else None),
        "optimization": phase("blocked" if blocked else "success", [],
                              {"tac": optimized_tac, "stats": stats},
                              "Lexical or syntax errors blocked this phase." if blocked else None),
    }
    return {
        "phases": phases,
        "success": not any(item["severity"] == "error" for item in all_diagnostics),
        "blocked": blocked,
        "diagnostics": all_diagnostics,
        "ast": program,
        "optimized_tac": optimized_tac,
    }


def run_source(source: str, inputs: list[str] | None = None) -> dict[str, Any]:
    compiled = compile_source(source)
    interpreter = Interpreter(compiled["ast"], inputs)
    execution = interpreter.run()
    return {
        "execution": execution,
        "compile": {key: value for key, value in compiled.items() if key not in {"ast", "optimized_tac"}},
        "compile_success": compiled["success"],
        "snapshots": interpreter.snapshots,
    }
