// Attempts to implement the ex editor (http://pubs.opengroup.org/onlinepubs/9699919799/utilities/ex.html) with some tweaks to make it javascript-friendly 
// javascript regular expressions (and change ?regexp? addressing to ?/regexp/ since '?' is used so often as a metacharacter.
// It's also much more forgiving of syntax errors.
// errors are thrown with {message: 'whatever'}
// messages are returned in range.exMessage

// documentation: to be created
// Version 0.9
//  depends: bililiteRange.js, bililiteRange.util.js

// Copyright (c) 2013 Daniel Wachsstock
// MIT license:
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation
// files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use,
// copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following
// conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
// OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
// WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
// OTHER DEALINGS IN THE SOFTWARE.

(function(undefined){

/*********************** shims: it's be nice to IE8 day *********************************/
if(!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g,'');
  };
}
if (!String.prototype.repeat){
	// from http://stackoverflow.com/questions/202605/repeat-string-javascript
	String.prototype.repeat = function(count) {
			if (count < 1) return '';
			var result = '', pattern = this.valueOf();
			while (count > 0) {
					if (count & 1) result += pattern;
					count >>= 1, pattern += pattern;
			}
			return result;
	};
}
/*********************** utility plugins *********************************/
bililiteRange.extend ({
lines: function(i, j){
	if (arguments.length){
		// selects the entire lines between i and j. 
		if (i === undefined) i = j;
		if (j === undefined) j = i;
		if (i > j) j = (i += j -= i) - j; // ludicrously hacky 1-line swap (http://www.greywyvern.com/?post=265)
		if (j <= 0) return this.bounds('start');
		var totallines = this.all().split('\n').length;
		if (i > totallines) return this.bounds('end');
		var start = this.line(i).bounds('BOL').bounds();
		var end = this.line(j).bounds('EOL').bounds();
		return this.bounds([start[0], end[1]]);
	}else{
		var test = this.clone();
		return [test.line(), test.bounds('endbounds').line()];
	}
},

newline: function(line, select){
	//insert text in a line by itself. Note that it's a newline, not a <br/> even if that would be appropriate
	var b = this.bounds();
	var text = this.all();
	if (b[0] > 0 && text.charAt(b[0]-1) != '\n') line = '\n'+line;
	if (b[1] < text.length && text.charAt(b[1]) != '\n') line += '\n';
	return this.text(line, select);
}

});

/*********************** the actual ex plugin *********************************/
bililiteRange.ex = {}; // namespace for exporting utility functions

bililiteRange.fn.ex = function (commandstring, defaultaddress){
	this.exMessage = '';
	this.undo(0); // initialize
	var state = this.exState();
	// default address is generally the current line; 'bounds' means use the current bounds. '%' means the entire text
	defaultaddress = defaultaddress || '.';
	// set the next-to-last mark
	var b = this.bounds(), lastb = state.marks["''"].bounds();
	if (b[0] != lastb[0] || b[1] != lastb[1]){
		state.marks["'"].bounds(lastb);
		state.marks["''"].bounds(b);
	}
	// actually do the command
	commandstring = commandstring.replace(/^:+/,''); // ignore initial colons that were likely accidentally typed.
	splitCommands(commandstring, '|').forEach(function(command){
		var parsed = parseCommand(command, defaultaddress);
		interpretAddresses(this, parsed.addresses, state);
		parsed.command.call(this, parsed.parameter, parsed.variant);
	}, this);	
	this.dispatch({type: 'excommand', command: commandstring, range: this});
	return this; // allow for chaining
};

var exStates = []; // to avoid memory leaks, 
bililiteRange.fn.exState = function(){
	var state = exStates[this.element().exState];
	if (!state){
		state = exStates[this.element().exState = exStates.length] = new ExState(this);
	}
	return state; 
}

function ExState(rng){
	// defaults
	this.autoindent = false;
	this.shiftwidth = 8;
	this.multiline = true;
	this.wrapscan = true;

	try{
		Object.defineProperty(this, 'privates', {
			enumerable: false,
			configurable: true,
			writable: true
		});
	}catch(e){}
	this.privates = {};
	this.rng = rng;
	this.marks = {
		"'": rng.clone().live(), // this will record the last position in the text
		"''": rng.clone().live() // this records the current position; just so it can be copied into ' above
	}
}
ExState.prototype = { privates: {} };

privatize ('rng');
privatize ('marks');
function createOption (option, value){
	ExState.prototype[option] = value;
}
function privatize(option, isPrivate){
	if (!(option in ExState.prototype.privates)){
		// not been defined before
		ExState.prototype.privates[option] = ExState.prototype[option]; // save the default
	}
	try{
		Object.defineProperty(ExState.prototype, option, {
			enumerable: false,
			configurable: true,
			get: function() {
				return option in this.privates ?
					this.privates[option] :
					ExState.prototype.privates[option];
			},
			set: function(val){
				this.privates[option] = val;
			},
		});
	}catch(e){
		// IE 8 won't let me define properties on regular objects, so the state will not be monitored. Live with it
		console.error(e);
	}
};
function monitor (option){
	// set option to signal on all changes
	if (!(option in ExState.prototype)) privatize(option);
	try {
		Object.defineProperty(ExState.prototype, option, {
			set: function(val){
				this.privates[option] = val;
				this.privates.rng.dispatch ({type: 'exstate', bubbles: true, detail: {option: option, value: val}});
			}
		});
	}catch(e){
		console.error(e);
		// IE 8 won't let me define properties on regular objects, so the state will not be monitored. Live with it
	}
}
bililiteRange.ex.createOption = createOption;
bililiteRange.ex.privatize = privatize;
bililiteRange.ex.monitor = monitor;

var registers = bililiteRange.ex.registers = []; // the delete register is a stack, with 0 the most recent (use shift rather than pop)

/*********************** command completion *********************************/

function commandCompletion(command){
	var ret = (function(){
		if (commands[command]) return commands[command];
		command = command.toLowerCase();
		for(trialCommand in commands){
			if (trialCommand.substr(0,command.length) == command) return commands[trialCommand];
		}
		throw {message: command+" not defined"};
	})();
	if (typeof ret == 'string') return commandCompletion(ret); // look for synonyms; beware of infinite loops!
	return ret;
}

/*********************** separating a command line into individual commands *********************************/
function splitCommands(commandLine, splitter){
	// need to be fancy about the | in regexps and strings; rather than try to make a monster regexp, use a simple parser
	var commands = [];
	var delims = /[/"]/; // regular expressions and strings
	var escaper = /\\/;
	for (var i = 0; i < commandLine.length; ++i){
		if (commandLine.indexOf(splitter, i) == i){
			// terribly inefficient to do the same search every time through the loop, but probably faster to use the native indexOf than any other search
			commands.push (commandLine.slice(0, i));
			commandLine = commandLine.slice(i+splitter.length);
			i = -1; // restart the loop
			continue;
		}
		var c = commandLine.charAt(i);
		if (escaper.test(c)) ++i;
		if (delims.test(c)){
			// scan forward until the end of the string
			for (var j = i+1; j <= commandLine.length; ++j){
				var d = commandLine.charAt(j);
				if (d === '') {
					// fell off the end; we will close the string
					commandLine += c;
					d = c;
				}
				if (escaper.test(d)) ++j;
				if (c == d){
					i = j;
					break;
				}
			}
		}
	}
	commands.push(commandLine); // the rest of the line
	return commands;
}

/*********************** parsing individual commands *********************************/
// create a regular expression to cover all possible address indicators.
// Rather than write the whole ugly thing out, synthesize it.
var REflags = 'igmwIMW'; // valid flags for regular expressions (I and M mean not i and m when they are the default, and w means wrap, overriding
// the state of wrapscan; W means no wrapping
function bslash(s) {return s.replace('\\', '\\\\')} // need to double-escape backslashes
var addressRE = new RegExp('^\\s*' + // allow whitespace at the beginning
	'('+[
		'%%', // my extension to mean "current range"
		'[.\\$%]', // single character addresses
		'\\d+', // line numbers
		"'['a-z]", // marks
		bslash("\\&?[/?]"), // special regexps: \/, \&\, \?, \&?
		// forward (/ delimited) regexps, a slash followed by some (escaped character or a non slash) ended with a slash, possibly preceded with a question mark
		'\\??'+bslash('/(?:\\.|[^/])*/['+REflags+']*')
	].join('|')+')'
);

// command id's in the real ex are letters and = & ~ > < 
var idRE = /^\s*([a-zA-Z=&~><]+)/;
var aUnicode = 'a'.charCodeAt(0);
function encodeID (c){
	// encodes a single character in base-26 (a-z) numbers preceded by '&'; sort of like encodeURI with '%'s
	// but with characters legal in ex commands
	function encode(x) {
		if (x < 26) return String.fromCharCode(x + aUnicode);
		return encode(x/26) + encode(x%26);
	};
	return '&' + encode(c.charCodeAt(0));
}
bililiteRange.ex.toID = function (s){
	// creates a legal id from an arbitrary string. Since I use sendkeys/keymap, I special-case those characters
	return s.replace(/./g, function (c){
		if (idRE.test(c)) return c;
		return {
			'-': '~',
			'%': 'alt~',
			'^': 'ctl~',
			'+': 'shift~',
			'{': '<',
			'}': '>'
		}[c] || encodeID(c) ;
	});
}

function parseCommand(command, defaultaddress){
	return {
		addresses: parseAddresses(),
		command: commandCompletion(parseCommandWord()),
		variant: parseVariant(),
		parameter: parseParameter()
	};
	
	function parseAddresses(){
		var addresses = [defaultaddress];
		// basic addresses
		command = command.replace(addressRE, function(match, c){
			addresses = [c];
			return '';
		});
		// relative addresses
		command = command.replace(/^\s*[-+\d]+/, function (match){
			addresses[0] += match;
			return '';
		});
		// a comma separates addresses
		if (/^\s*([,;])\s*/.test(command)){
			command = command.replace(/^\s*([,;])\s*/, '');
			if (RegExp.$1 == ';') addresses.push(';'); // need to track semicolons since they change the value of '.'
			addresses.push.apply(addresses, parseAddresses()); // recursively parse the whole list
		}
		return addresses;
	}

	function parseCommandWord(){
		if (/^\s*$/.test(command)) return 'print'; // blank line just goes to the addressed line, which is what we do with print
		var ret;
		command = command.replace(idRE, function (match, c){
			ret = c;
			return '';
		});
		if (!ret) throw {message: "No command string"};
		return ret;
	}
	function parseVariant(){
		var variant = false;
		command = command.replace(/^\s*!/, function (){
			variant = true;
			return '';
		});
		return variant;
	}
	function parseParameter(){
		return (string(command));
	}
}

function string(text){
	// we use JSON strings if it is necessary to include special characters
	if (text === undefined) return '';
	text = text.trim();
	if (text.charAt(0) == '"') text = JSON.parse(text);
	return text;
}
bililiteRange.ex.string = string; // export it

/*********************** turn an array of address descriptions into an actual range *********************************/
var lastRE = /(?:)/; // blank RE's refer to this
function interpretAddresses (rng, addresses){
	// %% is the current range. If it is used by itself, don't change the range (or use line-based addressing)
	if (addresses.length == 1 && addresses[0] == "%%") return;
	var state = rng.exState();
	var lines = [];
	var currLine = rng.line();
	addresses.forEach(function(s){
		var offset = 0;
		s = s.replace(/[-+\d]+$/, function (match){
			offset = interpretOffset(match);
			return '';
		});
		if (s.charAt(0) == '/'){
			var re = createRE(s, state.ignorecase);
			lines.push(rng.bounds('EOL').find(re, !state.wrapscan).bounds('EOL').line()+offset);
		}else if (s.charAt(0) == '?'){
			// since having ? as a delimiter wreaks havoc with Javascript RE's, use ?/....../
			re = createRE(s.slice(1), state.ignorecase);
			lines.push(rng.bounds('BOL').findBack(re, !state.wrapscan).bounds('EOL').line()+offset);
		}else if (s.charAt(0) == "'"){
			var mark = state.marks[s.slice(1)];
			if (mark){
				lines.push(mark.line());
			}else{
				throw {message: 'Mark '+s.slice(1)+' not defined'};
			}
		}else if (/\d+/.test(s)){
			lines.push(rng.line(parseInt(s)).find(/.*/).bounds('endbounds').line()+offset); // make sure we go to the end of the line
		}else if (s == '.'){
			lines.push(currLine+offset);
		}else if (s == '%%'){
			lines.push.apply(lines, rng.lines());
		}else if (s == '$'){
			lines.push (rng.bounds('all').bounds('endbounds').line()+offset);
		}else if (s == '%'){
			lines.push(0);
			lines.push (rng.bounds('all').bounds('endbounds').line());
		}else if (s == ';'){
			currLine = rng.line();
		}else if (s == ''){
			lines.push(offset);
		}
	});
	var lastline = lines.pop();
	rng.lines(lines.pop(), lastline);
}

function createRE(s, ignorecase){
	// create a RegExp from a string (with an aribitrary delimiter), of the form /re/(rest)?/?flags?/? (the "rest" part is for the substitute command)
	// as with splitCommands above, easier to scan with a simple parser than to use RegExps
	var delim = s.charAt(0);
	var escaper = /\\/;
	var re, rest,flags;
	for (var i = 1; i < s.length; ++i){
		c = s.charAt(i);
		if (escaper.test(c)) ++i;
		if (c == delim) break;
	}
	re = s.substring(1, i);
	s = s.substring(i+1);
	// flags may end with a delimiter, put in by the parser in splitCommands
	s = s.replace(RegExp('(['+REflags+']*)\\'+delim+'?$'), function(match, p1){
		flags = p1;
		return '';
	});
	if (re == ''){
		// blank string means use last regular expression
		re = lastRE.source;
		flags = flags || lastRE.flags;
	}
	if (!/M/i.test(flags)) flags += 'm'; // default is multiline mode unless we mark it otherwise with M
	if (ignorecase && !/I/i.test(flags)) flags += 'i'; // allow for global option to ignore case
	var ret = new RegExp(re, flags.replace(/[^igm]/g,''));  // don't forget to remove the invalid flags
	if (/w/.test(flags)) ret.nowrap = false;
	if (/W/.test(flags)) ret.nowrap = true;
	ret.rest = s.replace(new RegExp('\\'+delim+'$'), ''); // remove the last delimiter if present
	lastRE = ret;
	lastRE.flags = flags;
	return ret;
}
bililiteRange.ex.createRE = createRE;

function interpretOffset(s){
	var re = /([-+]\d*)|\d+/g, ret = 0, match;
	while(match = re.exec(s)){
		switch (match[0]){
			case '+' : ++ret; break;
			case '-' : --ret; break;
			default: ret += parseInt(match[0]);
		}
	}
	return ret;
}

/*********************** the registers *********************************/

function pushRegister(text, register){
	if (register){
		if (/^[A-Z]/.test(register)){
			// uppercase means append
			registers[register.toLowerCase()] += text;
		}else{
			registers[register] = text;
		}
	}else{
		// unnamed register is the delete stack
		registers.unshift(text);
	}		
}

function popRegister (register){
	return register ? registers[register.toLowerCase()] : registers.shift();
}

/*********************** autoindenting *********************************/

function indentation(rng){
	// returns the whitespace at the start of this line
	return /^\s*/.exec(rng.clone().bounds('line').text())[0];
}
function indent(text, tabs){
	return text.replace(/(^|\n)/g, '$1'+tabs);
}
function autoindent (text, rng){
	return indent(text, indentation(rng));
}
function unindentone(str, n){ // n is the number of spaces to consider a single tab
	n = parseInt(n); if (isNaN(n) || n < 1) n = 4;
	var re = new RegExp('(^|\n)(\t| {'+n+'})', 'g');
	return str.replace(re, '$1');
}
function unindent (str, repeat, n){
	for (var i = 0; i < repeat; ++i) str = unindentone(str, n);
	return str;
}
/*********************** the actual editing commands *********************************/

// exported utility functions
function booleanOption (option){
	return function (parameter, variant){
		var state = this.exState();
		if (parameter=='?'){
			this.exMessage = state[option] ? 'on' : 'off';
		}else if (parameter == 'off' || parameter == 'no' || parameter == 'false'){
			state[option] = variant;
		}else if (parameter == 'toggle'){
			state[option] = !state[option];
		}else{
			state[option] = !variant; // variant == false means take it straight and set the option
		}
	};
}
bililiteRange.ex.booleanOption = booleanOption;

function stringOption (name){
	return function (parameter, variant){
		if (parameter == '?' || parameter === true || !parameter){
			this.exMessage = JSON.stringify(this.exState()[name]);
		}else{
			this.exState()[name] = parameter;
		}
	}
}
bililiteRange.ex.stringOption = stringOption;

// a command is a function (parameter {String}, variant{Boolean}). 'this' is the bililiteRange; or a string that marks a synonym
var commands = bililiteRange.ex.commands = {
	a: 'append',

	ai: 'autoindent',

	append: function (parameter, variant){
		// the test is variant XOR autoindent. the !'s turn booleany values to boolean, then != means XOR
		if (!variant != !this.exState().autoindent) parameter = autoindent(parameter, this);
		this.bounds('endbounds').newline(parameter, 'end');
	},

	autoindent: booleanOption ('autoindent'),

	c: 'change',

	change: function (parameter, variant){
		if (!variant != !this.exState().autoindent) parameter = autoindent(parameter, this);
		pushRegister (this.text());
		this.newline(parameter, 'end');
	},

	copy: function (parameter, variant){
		var targetrng = this.clone();
		var parsed = parseCommand(parameter);
		interpretAddresses(targetrng, parsed.addresses);
		targetrng.bounds('endbounds').newline(this.text(), 'end');
		this.bounds(targetrng.bounds());
	},

	del: function (parameter, variant){
		var match = /^([a-zA-Z]?)\s*(\d*)/.exec(parameter);
		// the regular expression will match anything (all the components are optional), so match is never false
		if (match[2]){
			// a count means we to change the range in e.g., 1,2 d 3 from [1,2] to [2,2+3-1] (3 lines from the end of the range, inclusive)
			var lines = this.lines();
			this.lines(lines[1], lines[1]+Math.max(1, parseInt(match[2]))-1);
		}
		pushRegister(this.text(), match[1]);
		// need to delete the newline as well.
		this.bounds([this.bounds()[0], this.bounds()[1]+1]);
		this.text('', 'end');
	},

	'delete': 'del',

	global: function (parameter, variant){
		var re = createRE(parameter, this.exState().ignorecase);
		// turn pat into a list of live bookmarks
		var rngs = [];
		var lines = this.lines();
		for (i = lines[0]; i <= lines[1]; ++i){
			var line = this.clone().lines(i);
			if (re.test(line.text()) ? !variant : variant){ // that's re.test XOR variant
				rngs.push(line.live());
			}
		}
		rngs.forEach(function(line){
			splitCommands(re.rest, '\\n').forEach(function(command){
				var parsed = parseCommand(command);
				parsed.command.call(line, parsed.parameter, parsed.variant);
			});
		});
		this.bounds (rngs.length ? rngs.pop().bounds() : 'endbounds');
	},

	hardtabs: 'shiftwidth',

	ht: 'shiftwidth',

	i: 'insert',

	ignorecase: booleanOption ('ignorecase'),

	insert: function (parameter, variant){
		if (!variant != !this.exState().autoindent) parameter = autoindent(parameter, this);
		this.bounds('startbounds').newline(parameter, 'end');
	},

	ic: 'ignorecase',

	join: function (parameter, variant){
		var lines = this.lines();
		var match = /^\d+/.exec(parameter);
		if (match){
			// a count means we to change the range in e.g., 1,2 d 3 from [1,2] to [2,2+3-1] (3 lines from the end of the range, inclusive)
			lines = [lines[1], lines[1]+parseInt(match[0])-1];
		}
		if (lines[0] == lines[1]) ++lines[1]; // join at least 2 lines
		var re = variant ? /\n/g : /\s*\n\s*/g;
		var replacement = variant ? '' : ' '; // just one space. Doesn't do what the ex manual says about not inserting a space before a ')'
		this.lines(lines[0],lines[1]);
		this.text(this.text().replace(re, replacement), 'start');
	},

	k: 'mark',

	m: 'move',

	mark: function (parameter, variant){
		this.exState().marks[parameter] = this.clone().live();
	},

	ml: 'multiline',

	move: function (parameter, variant){
		var thisrng = this.clone().live();
		commands.copy.call (this, parameter, variant);
		commands.del.call (thisrng, '', false);
	},

	multiline: booleanOption ('multiline'),

	notglobal: function (parameter, variant){
		commands.global.call (this, parameter, !variant);
	},

	print: function() { this.select() },

	put: function (parameter, variant){
		// this seems to be the correct definition, but should this respect autoindent?
		commands.append.call (this, popRegister(parameter), variant);
	},

	redo: function (parameter, variant){
		// restores the text only, not any other aspects of state
		this.undo(-1);
	},

	s: 'substitute',

	set: function (parameter, variant){
		if (!parameter || parameter == 'all'){
			// only display the stringifiable options
			this.exMessage = JSON.stringify(this.exState());
		}else{
			var self = this;
			splitCommands(parameter, ' ').forEach(function(command){
				var match = /(no)?(\w+)(\?|=(\S+)|)/.exec(command);
				if (!match && command.trim()) throw {message: 'Bad syntax in set: '+command};
				var func = match[2];
				if (match[1]){
					var value = match[1];
				}else if (!match[3]){
					value = 'on';
				}else if (match[3] == '?'){
					value = '?';
				}else{
					value = string(match[4]);
				}
				commandCompletion(func).call(self, value, variant); // each option takes care of its own setting
			});
		}
	},

	shiftwidth: function (parameter, variant){
		if (parameter == '?' || parameter === true || !parameter){
			this.exMessage = '['+this.exState().shiftwidth+']';
		}else{
			var shiftwidth = parseInt(parameter);
			if (isNaN(shiftwidth) || shiftwidth <= 0) throw {message: 'Invalid value for shiftwidth: '+parameter};
			this.exState().shiftwidth =
				this.element().style.tabSize =
				this.element().style.OTabSize =
				this.element().style.MozTabSize = shiftwidth; // for browsers that support this.
		}
	},

	substitute: function (parameter, variant){
		// we do not use the count parameter (too hard to interpret s/(f)oo/$1 -- is that last 1 a count or part of the replacement?
		// easy enough to assume it's part of the replacement but that's probably not what we meant)
		var re = createRE(parameter, this.exState().ignorecase);
		this.text(this.text().replace(re, string(re.rest))).bounds('endbounds');
	},

	sw: 'shiftwidth',

	t: 'copy',

	tabstop: 'shiftwidth',

	transcribe: 'copy',

	ts: 'shiftwidth',

	u: 'undo',

	undo: function (parameter, variant){
		// restores the text only, not any other aspects of state
		this.undo();
	},

	v: 'notglobal',

	wrapscan: booleanOption ('wrapscan'),

	ws: 'wrapscan',

	yank: function (parameter, variant){
		var match = /^([a-zA-Z]?)\s*(\d*)/.exec(parameter);
		// the regular expression will match anything (all the components are optional), so match is never false
		if (match[2]){
			// a count means we to change the range in e.g., 1,2 y 3 from [1,2] to [2,2+3-1] (3 lines from the end of the range, inclusive)
			var lines = this.lines();
			this.lines(lines[1], lines[1]+Math.max(1, parseInt(match[2]))-1);
		}
		pushRegister(this.text(), match[1]);
	},

	'=': function (){
		var lines = this.lines();
		this.exMessage = '['+(lines[0] == lines[1] ? lines[0] : lines[0]+', '+lines[1])+']';
	},
	
	'&': 'substitute',

	'~': function (parameter, variant){
		// repeat substitution with last replacement string as the search pattern
		// according to http://pubs.opengroup.org/onlinepubs/9699919799/utilities/ex.html, this is synonymous with &
		// but according to the original ex manual (http://roguelife.org/~fujita/COOKIES/HISTORY/1BSD/exrefm.pdf)
		// this is the definition. It seems useless to have two identical shortcuts, so I'll use the latter
		lastRE = new RegExp (lastRE.rest, 'g');
		commands.substitute.call (rng, parameter, variant);
	},
	
	'>': function (parameter, variant){
		parameter = parseInt(parameter);
		if (isNaN(parameter) || parameter < 0) parameter = 1;
		this.text(indent(this.text(), '\t'.repeat(parameter)));
	},
	
	'<': function (parameter, variant){
		parameter = parseInt(parameter);
		if (isNaN(parameter) || parameter < 0) parameter = 1;
		this.text(unindent(this.text(), parameter, this.exState().shiftwidth));
	}
};

})();