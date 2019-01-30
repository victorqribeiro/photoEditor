if('serviceWorker' in navigator) {
  navigator.serviceWorker
           .register('/photoEditor/sw.js', {scope: './'})
           .then(response => response)
           .catch(reason => reason);
}

let deferredPrompt;
const addBtn = document.createElement('button');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  addBtn.style.display = 'block';
  addBtn.addEventListener('click', (e) => {
    addBtn.style.display = 'none';
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        deferredPrompt = null;
      });
  });
});

let canvas, c, canvasAux, cAux, selection, image, originalImg;

function init(){
	let label = document.createElement('label');
	label.htmlFor = "file";
	label.classList.add('myButton');
	label.innerText = "Open";
	let file = document.createElement('input');
	file.id = "file";
	file.type = "file";
	file.addEventListener("change",open);
	let toolbar = document.createElement('div');
	toolbar.id = "toolbar";
	toolbar.appendChild(label);
	toolbar.appendChild(file);
	let tools = [
		{name: "Save", func: saveToPNG, input: false},
		{name: "Remove Noise", func: saltPepperRemoval, input: true},
		{name: "Rotate", func: rotate, input: false},
		{name: "Flip X", func: flipHorizontal, input: false},
		{name: "Flip Y", func: flipVertical, input: false},
		{name: "Gray", func: RGBAtoGray, input: false},
		{name: "Contrast", func: contrast, input: false},
		{name: "Sharpen", func: sharpen, input: false},
		//{name: "Crop", func: crop, input: false}
		{name: "Ascii", func: ascii, input: false},
		{name: "Region", func: getRegion, input: true}
	];
	for(t of tools){
		let d = document.createElement('div');
		if(t.input){
			let input = document.createElement('input');
			input.id = t.name.replace(' ','');
			input.value = 3;
			input.size = 2;
			d.appendChild( input );
		}
		let button = document.createElement('button');
		button.id = t.name;
		button.innerText = t.name;
		button.onclick = t.func;
		d.appendChild( button );
		toolbar.appendChild( d );
	}
	document.body.appendChild(toolbar);
}

init();

function open(e){
	if(e.target.files[0]){
		image = e.target.files[0];
		let url = window.URL || window.webkitURL;
		let img = new Image();
		img.src = url.createObjectURL(image);
		img.onload = function(){
			originalImg = this;
			draw(img);
		};
	}
}

function draw(img){
	canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	c = canvas.getContext('2d');
	c.drawImage(img,0,0);
	let oldCanvas = document.getElementsByTagName('canvas')[0];
	if(oldCanvas)
		oldCanvas.remove();
	document.body.appendChild( canvas );
}

function dataToRGBA(imgData){
	let _r = [], _g = [], _b = [], _a = [];
	for(let i = 0, end = imgData.data.length; i < end; i+=4){
		_r.push( imgData.data[i] );
		_g.push( imgData.data[i+1] );
		_b.push( imgData.data[i+2] );
		_a.push( imgData.data[i+3] );
	}
	return {r:_r, g:_g, b:_b, a:_a, w: imgData.width, h: imgData.height};
}

function RGBAtoData(imgData){
	let img = new ImageData(imgData.w,imgData.h);
	for(let i = 0, j = 0; i < img.data.length-3; i+=4, j++){
		img.data[i] = imgData.r[j];
		img.data[i+1] = imgData.g[j];
		img.data[i+2] = imgData.b[j];
		img.data[i+3] = imgData.a[j];
	}
	return img;
}

function RGBAtoGray(){
	if(!image)
		return
	let img = c.getImageData(0,0,canvas.width,canvas.height);
	for(let i = 0; i < img.data.length; i+=4){
		let v = (img.data[i] * 0.2126) + (img.data[i+1] * 0.7152) + (img.data[i+2] * 0.0722);
		img.data[i] = v;
		img.data[i+1] = v;
		img.data[i+2] = v;
	}
	c.putImageData( img, 0, 0 );
}

function saltPepperRemoval(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	let noiseRemove = function(colorData,w,h,window){
		for(let i = Math.floor(window/2), end = h-Math.floor(window/2); i < end; i++){
			for(let j = Math.floor(window/2), end = w-Math.floor(window/2); j < end; j++){
				let n = [];
				for(let y = -Math.floor(window/2); y < window-Math.floor(window/2); y++){
					for(let x = -Math.floor(window/2); x < window-Math.floor(window/2); x++){
						n.push( colorData[((i+y) * w + (j+x))] );
					}
				}
				n.sort( function(a, b){ return a - b } );
				colorData[ i * w + j ] = n[Math.floor((window*window)/2)];
			}
		}
		return colorData;
	}
	let w = document.getElementById("RemoveNoise").value;
	w = isNaN(w) || w > 9 || w < 3 ? 3 : w%2 ? w : w-1;
	data.r = noiseRemove(data.r, data.w, data.h, w);
	data.g = noiseRemove(data.g, data.w, data.h, w);
	data.b = noiseRemove(data.b, data.w, data.h, w);
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function sharpen(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	let sharp = function(colorData,w,h){
		let newColorData = Array(h).fill().map(_=>Array(w).fill(0));
		for(let i = 1, end = h-1; i < end; i++){
			for(let j = 1, end = w-1; j < end; j++){
				let v = ( colorData[ (i-1) * w + j ] + colorData[ (i+1) * w + j ]
								+ colorData[ i * w + (j-1) ] + colorData[ i * w + (j+1) ] ) - (4*colorData[ i * w + j ]);
				newColorData[i * w + j] = v;
			}
		}
		for(let i = 1; i < h-1; i++){
			for(let j = 1; j < w-1; j++){
				colorData[i * w + j] -= newColorData[i * w + j]*0.5; 
			}
		}
		return colorData;
	}
	data.r = sharp(data.r, data.w, data.h);
	data.g = sharp(data.g, data.w, data.h);
	data.b = sharp(data.b, data.w, data.h);
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function contrast(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	let increaseContrast = function(colorData){
		let black = 255, white = 0;
			for (let i = 0; i < colorData.length; i++) {
			  if (colorData[i] < black) {
			    black = colorData[i];
			  }
			  if (colorData[i] > white) {
			    white = colorData[i];
			  }
			}
	  for (let i = 0; i < colorData.length; i++) {
			colorData[i] = (colorData[i] - black) / (white - black) * 255;
  	}
	return colorData;
	}
	data.r = increaseContrast(data.r);
	data.g = increaseContrast(data.g);
	data.b = increaseContrast(data.b);
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function transpose(d,width,height){
	let data = Array(d.length);
  for(let i = 0; i < height; i++){
    for(let j = 0; j < width; j++){
      data[j * height + i] = d[i * width + j];
    }
  }
	return data;
}

function reverseRow(d,width,height){
	let data = Array(d.length);
  for(let i = 0; i < height; i++){
    for(let j = 0; j < width; j++){
     data[i * width + j] = d[i * width + (width-1-j)];
    }
  }
	return data;
}

function reverseColumn(d,width,height){
	let data = Array(d.length);
  for(let i = 0; i < height; i++){
    for(let j = 0; j < width; j++){
     data[i * width + j] = d[(height-1-i) * width + j];
    }
  }
	return data;
}

function flipHorizontal(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	data.r = reverseRow(data.r, data.w, data.h);
	data.g = reverseRow(data.g, data.w, data.h);
	data.b = reverseRow(data.b, data.w, data.h);
	data.a = reverseRow(data.a, data.w, data.h);
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function flipVertical(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	data.r = reverseColumn(data.r, data.w, data.h);
	data.g = reverseColumn(data.g, data.w, data.h);
	data.b = reverseColumn(data.b, data.w, data.h);
	data.a = reverseColumn(data.a, data.w, data.h);
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function rotate(){
	if(!image)
		return
	let data = dataToRGBA(c.getImageData(0,0,canvas.width,canvas.height));
	data.r = transpose(data.r, data.w, data.h);
	data.g = transpose(data.g, data.w, data.h);
	data.b = transpose(data.b, data.w, data.h);
	data.a = transpose(data.a, data.w, data.h);
	let tmp = data.w;
	data.w = data.h;
	data.h = tmp;
	data.r = reverseRow(data.r, data.w, data.h);
	data.g = reverseRow(data.g, data.w, data.h);
	data.b = reverseRow(data.b, data.w, data.h);
	data.a = reverseRow(data.a, data.w, data.h);
	canvas.width = data.w;
	canvas.height = data.h;
	c.putImageData( RGBAtoData(data), 0, 0 );
}

function drawCanvasAux(){
	if(!image)
		return
	if(!canvasAux){
		canvasAux = document.createElement('canvas');
		document.body.appendChild( canvasAux );
	}
	let canvasPos = canvas.getBoundingClientRect();
	canvasAux.style.display = "block";
	canvasAux.style.position = "absolute";
	canvasAux.style.top = canvasPos.y+"px";
	canvasAux.style.left = canvasPos.x+"px";
	canvasAux.style.margin = "0px";
	canvasAux.style.zIndex = "1";
	canvasAux.width = canvas.width;
	canvasAux.height = canvas.height;
	cAux = canvasAux.getContext('2d');
	/*
	cAux.fillStyle = "rgba(0,0,0,0.5)";
	cAux.fillRect(0,0,canvasPos.width,canvasPos.height);
	cAux.clearRect(canvasPos.width/2-50,canvasPos.height/2-50,100,100);
	*/
}

function ascii(){
	if(!image)
		return
	RGBAtoGray();
	let data = c.getImageData(0,0,canvas.width,canvas.height);

	let chars = ["@","%","#","*","+","=","-",":","."," "];
	let chars2 = ["$","@","B","%","8","&","W","M","#","*","o","a","h","k","b","d","p","q","w","m","Z","O",
								"0","Q","L","C","J","U","Y","X","z","c","v","u","n","x","r","j","f","t","/","\\","|","(",
								")","1","{","}","[","]","?","-","_","+","~","\<","\>","i","!","l","I",";",":",",","\"","^",
								"`","'","."," "];
	let string = "";
	let grayStep = Math.ceil( 255 / chars.length );
	c.fillStyle = "white";
	c.fillRect(0,0,canvas.width,canvas.height);
	c.font = "5px Courier";
	c.fillStyle = "black";
	for(let i = 0; i < canvas.height*4; i+=4){
		for(let j = 0; j < canvas.width*4; j+=4){
			for(let x = 0; x < chars.length; x++){
				if( data.data[( i * canvas.width + j)*4] < (x*grayStep)+grayStep ){
					c.fillText( chars[x], j, i );
					break;
				}
			}
		}
	}
}

function drawSelection(){
	if(!image || !selection)
		return
	cAux.fillStyle = "rgba(0,0,0,0.5)";
	cAux.fillRect(0,0,canvasAux.width,canvasAux.height);
	cAux.clearRect(selection.x,selection.y,selection.w,selection.h);
}

function crop(){
	drawCanvasAux();
	selection = {
		x: canvasAux.width/2-50,
		y: canvasAux.height/2-50,
		w: 100,
		h: 100
	};
	if(selection)
		drawSelection();
}

function getRegion(){
	if(!image)
		return
	canvas.addEventListener('click', region );
}

function distance(a,b){
	let d = 0;
	for(let i = 0; i < a.length; i++){
		d += Math.abs( a[i]-b[i] );
	}
	return d;
}

let region = function(e){
	let th = document.getElementById("Region").value;
	let rect = canvas.getBoundingClientRect();
	let mouseX = Math.floor((e.clientX - rect.left) * originalImg.width / rect.width);
	let mouseY = Math.floor((e.clientY - rect.top) * originalImg.height / rect.height);
	let data = c.getImageData(0,0,canvas.width,canvas.height);
	let region = {};
	let toLook = [];
	let visited;

	region[ mouseX+','+mouseY ] = true;
	toLook.push( mouseX, mouseY );
	while(toLook.length !== 0){
		let x = toLook.shift();
		let y = toLook.shift();
		let indexM = (y * data.width + x)*4;
		let me = [
			data.data[indexM],
			data.data[indexM+1],
			data.data[indexM+2],
		];
		for(let i = -1; i < 2; i++){
			for(let j = -1; j < 2; j++){
				visited = false;
				if( x+j >= 0 && x+j < data.width && y+i >= 0 && y+i < data.height ){
					if( !region[(x+j)+','+(y+i)] ){
						let indexN = ((y+i) * data.width + (x+j))*4;
						let neighbour = [
							data.data[indexN],
							data.data[indexN+1],
							data.data[indexN+2],
						];
						let dist = distance(me,neighbour);
						if( dist < th ){
							region[ (x+j)+','+(y+i) ] = true;
							toLook.push( x+j, y+i );
						}
					}
				}
			}
		}
	}

	
	for(let key in region ){
		let value = key.split(',').map( v => parseInt(v) );
		let index = (value[1] * data.width + value[0])*4;
		data.data[ index+3 ] = 0;
	}
	
	c.putImageData( data, 0, 0 );
	
	removeEvent();
}

function removeEvent(){
	canvas.removeEventListener('click', region );
}

function saveToPNG(){
	if(!image)
		return
  canvas.toBlob( function(blob){
		let link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = image.name.substring(0,image.name.length-4).replace('.','')+'.png';
		link.click();
  });
}

window.onresize = function(){
	if(selection){
		drawCanvasAux();
		drawSelection();
	}
};
