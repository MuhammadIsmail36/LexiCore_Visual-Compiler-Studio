/** Bundled MiniLang samples, copied from docs/samples/. */

export interface SampleFile {
  name: string;
  source: string;
  description: string;
}

export const SAMPLES: SampleFile[] = [
  {
    name: 'baseline.min',
    description: 'Minimal declaration, assignment and print',
    source: `START
INT a = 10;
INT b = 20;
INT result;
result = a + b;
PRINT result;
STOP
`,
  },
  {
    name: 'lexical_features.min',
    description: 'Comments, escapes and all literal kinds',
    source: `// LexiCore lexer regression sample.
/* Block comments
   may span lines. */
START
INT count = 10;
FLOAT price = 12.5;
STRING message = "Line\\nTab\\tQuote\\"Backslash\\\\";
BOOL active = TRUE;
count = count + 2 * 3 - 1;
IF count >= 15 AND active
    PRINT message;
ENDIF
STOP
`,
  },
  {
    name: 'control_flow.min',
    description: 'IF / ELSE and a WHILE loop',
    source: `START
INT i = 0;
WHILE i < 3
    IF i == 1
        PRINT "one";
    ELSE
        PRINT i;
    ENDIF
    i = i + 1;
ENDWHILE
STOP
`,
  },
  {
    name: 'functions.min',
    description: 'Recursion with frame-local variables',
    source: `START
FUNCTION fact(INT n)
IF n <= 1
RETURN 1;
ENDIF
RETURN n * fact(n - 1);
ENDFUNCTION
PRINT fact(6);
STOP
`,
  },
  {
    name: 'arrays.min',
    description: 'Array allocation, store and load',
    source: `START
INT values[3];
values[0] = 10;
values[1] = 20;
values[2] = values[0] + values[1];
PRINT values[2];
STOP
`,
  },
  {
    name: 'arithmetic.min',
    description: 'Arithmetic expressions and precedence',
    source: `START
INT x = 8;
INT y = 3;
INT result;
result = x * y + 10 - 4 / 2;
PRINT result;
result = (x + y) * 2;
PRINT result;
STOP
`,
  },
  {
    name: 'nested_conditions.min',
    description: 'Nested IF / ELSE conditions',
    source: `START
INT score = 82;
IF score >= 50
    IF score >= 80
        PRINT "excellent";
    ELSE
        PRINT "pass";
    ENDIF
ELSE
    PRINT "fail";
ENDIF
STOP
`,
  },
  {
    name: 'while_sum.min',
    description: 'WHILE loop accumulation',
    source: `START
INT i = 1;
INT sum = 0;
WHILE i <= 5
    sum = sum + i;
    i = i + 1;
ENDWHILE
PRINT sum;
STOP
`,
  },
  {
    name: 'booleans.min',
    description: 'Boolean values and comparisons',
    source: `START
INT a = 5;
INT b = 10;
BOOL ready = TRUE;
IF a < b AND ready
    PRINT "a is smaller";
ENDIF
IF a == b OR NOT ready
    PRINT "unexpected";
ELSE
    PRINT "conditions ok";
ENDIF
STOP
`,
  },
  {
    name: 'array_loop.min',
    description: 'Fill and sum an array with a loop',
    source: `START
INT nums[4];
INT i = 0;
INT total = 0;
WHILE i < 4
    nums[i] = (i + 1) * 10;
    total = total + nums[i];
    i = i + 1;
ENDWHILE
PRINT total;
STOP
`,
  },
  {
    name: 'string_output.min',
    description: 'String declarations and printing',
    source: `START
STRING greeting = "Hello, LexiCore!";
STRING status = "Program running";
PRINT greeting;
PRINT status;
STOP
`,
  },
];
