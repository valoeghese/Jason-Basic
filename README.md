# Jason Basic

High quality programming language to implement the most important programs in.

There are some examples in the Examples folder you can check out.

# Syntax

## Comments

Comments can be done with `#`, `//`, `REM`, or `%`, depending on your preference. Comments must be on their own line.

```
# Hello
// We are the comments
REM to do something important
% do you like matlab comments??
```

## Variable Assign

Variables follow the conventions of most other languages. Alphanumeric, with _ allowed. Cannot start with a number.

```
a = 5
thingyThing = 10
```

Arrays can be instantiated with `DIM`
```
DIM a 5
# This will print the array. It is initialised with 0s.
PRINT a
# Output will be 0,0,0,0,0
```

No shorthand operators like +=, -=, etc.

You can access from arrays with `()`
Arrays are indexed from 0.
```
DIM a 6
a(5) = 100
PRINT a(5)
```

## Control Flow

IF/ELSE statements
```
IF expression
END IF
```

```
IF expression
ELSE
END IF
```

WHILE loop
```
WHILE expression
END WHILE
```

FOR each loop
Allows you to iterate over the elements of an array or the characters of a string.
In the future I plan to let you use an expression after IN instead of requiring a variable.
```
FOR iterator IN iterableVariable
END FOR
```

Labels and `GOTO`. Labels must follow the same naming standards as variables. 
```
Place:
PRINT "Hi"
GOTO Place
# This will create an infinite loop!
```

END. This terminates the whole program.
```
END
```

## Expressions

Most things exist. 

Arithmetic: `+`, `-`, `*`, `/`, `%`
Brackets: `(` `)`
Boolean: `!` `&` `|`
Comparison: `<` `>` `<=` `>=` `=`

Yep that's right folks. Single equals for both assign and compare.

## Builtins

There are some built in operations you can use.

Note that things that require a variable name can't take items in arrays (yet). If you need to e.g. generate a random number in an array, use a temp variable.

### I/O
```
PRINT (expression)
```

```
INPUT (expression) TO (variable name)
```
This just works as print in non-interactive modes (dj/msg in the discord bot). It will let you capture user input in interactive (dj/basic in the discord bot).

### Data Generation
```
RANDOM (variable name)
```
Generate random number from 0 to 1. Literally `Math.random()` from javascript.

### Data Manipulation
```
UPPERCASE (variable name)
```
Convert variable to uppercase. Also implicitly converts to string, so can be used to convert number to string.

```
LOWERCASE (variable name)
```
Convert variable to lowercase. Also implicitly converts to string, so can be used to convert number to string.

```
ROUND (variable name)
```
Round the number in the given variable.

## Breakpoints
Put * at the end of a line to make it print the values of every variable before every time it runs that line.
