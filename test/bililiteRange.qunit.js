multitest("Testing bililiteRange", function (rng, el, text, i){
	rng.all('');
	equal (rng.text(), '' , "element should be empty" );
	rng.text(text, 'all');
	equal (rng.text(), text, 'text set');
	equal (rng.length(), text.length, 'length calculated');
	var b = [1, 10];
	rng.bounds(b);
	deepEqual (rng.bounds(), b, 'bounds set');
	equal (rng.text(), text.substring.apply(text, b), 'bounds correspond to the correct text');
	equal (rng.all(), text, 'all retains correct text');
	rng.select();
	rng.bounds('selection');
	deepEqual (rng.bounds(), b, 'selection recorded');
	rng.element().blur();
	rng.element().focus();
	rng.bounds('selection');
	deepEqual (rng.bounds(), b, 'selection retained');
	if (el.nodeName.toLowerCase() == 'input') return; // insertEOL irrelevant on input elements
	b = [1,1];
	rng.bounds(b).insertEOL();
	equal (rng.length(), text.length+1, 'EOL inserted');
	deepEqual (rng.bounds(), [b[0]+1, b[0]+1], 'EOL moved bounds');
});
multitest("Testing bililiteRange scrolling", function (rng, el, text, i){
	rng.all('');
	rng.text(text, 'end'); // range at bottom of text
	el.scrollTop = 0; // scroll to top
	var top = rng.scrollIntoView().top();
	ok (el.scrollTop <= top && el.scrollTop+el.clientHeight >= top, 'scrolled');
});
multitest("Testing bililiteRange event handling", function (rng, el, text, i){
	expect(1);
	rng.text(text);
	function listen(evt) { ok(true, evt.type+' event fired') }
	rng.listen('click',listen);
	rng.dontlisten('click', listen);
	rng.listen('click',listen); // should only have one listener active
	rng.listen('click', start);
	rng.dispatch({type: 'click'});
}, true);
