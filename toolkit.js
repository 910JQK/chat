function $ (selector) {
    return document.querySelector(selector)
}


function $$ (selector) {
    return document.querySelectorAll(selector)
}


function one_of(...str_list) {
    return new Set(str_list)
}


function map (to_be_mapped, f) {
    let result = []
    if( to_be_mapped[Symbol.iterator] ) {
	let iterable = to_be_mapped
	let index = 0
	for ( let I of iterable ) {
	    result.push(f(I, index))
	    index += 1
	}
    } else {
	let hash = to_be_mapped
	for ( let key of Object.keys(hash) ) {
	    result.push(f(key, hash[key]))
	}
    }
    return result
}


function filter (object, f) {
  if ( object[Symbol.iterator] ) {
    let iterable = object
    let result = []
    for ( let element of iterable ) {
      if( f(element) ) {
	result.push(element)
      }
    }
    return result
  } else {
    let hash = object
    let result = {}
    for ( let key of Object.keys(hash) ) {
      if( f(key, hash[key]) ) {
	result[key] = hash[key]
      }
    }
    return result
  }
}


function filter_key (hash, f) {
    var result = {}
    for ( let key of Object.keys(hash) ) {
        if ( f(key, hash[key]) ) {
            result[key] = hash[key]
        }
    }
    return result
}


function *concat (...iterables) {
    for( let iterable of iterables ) {
	for ( let element of iterable ) {
	    yield element	
	}
    }
}


function clear(element) {
    while ( element.firstChild ) {
        element.removeChild(element.firstChild)
    }
}


function create (data) {
    if ( data instanceof HTMLElement ) { return data }
    let element = document.createElement(data.tag)
    element._fields = {}
    map(data.classList || [], name => element.classList.add(name))
    map(filter(['style', 'dataset'], p => data.has(p)), function(property) {
        map(data[property], function (key, value) {
            if ( value instanceof field ) {
                let field = value
                element._fields[field.name] = {
                    read: () => element[property][key],
                    update: value => element[property][key] = value
                }
                if ( field.has('initial') ) {
                    element[property][key] = initial
                }
            } else if ( data[property][key] !== null ) {
                element[property][key] = data[property][key]
            }
        })
    })
    map(data.handlers || {}, (ev, f) => element.addEventListener(ev, f))
    let reserved = one_of(
        'classList', 'style', 'dataset', 'handlers', 'children'
    )
    map(filter_key(data, k => !reserved.has(k)), function (property, value) {
        if ( value instanceof field ) {
            let field = value
            element._fields[field.name] = {
                read: () => element[property],
                update: value => element[property] = value
            }
            if ( field.has('initial') ) {
                element[property] = field.initial
            }
        } else if (value !== null) {
            element[property] = value
        }
    })
    map(data.children || [], child => element.appendChild(create(child)) )
    return element
}


function field (name, initial) {
    var object = Object.create(field.prototype)
    object.name = name
    object.initial = initial
    return field_object
}


function read (element, field_name) {
    if ( element._fields.has(field_name) ) {
        return element._fields[field_name].read.call(element)
    }
    for ( let child of element.children ) {
        let result = read(child, field_name)
        if ( typeof result != 'undefined' ) {
            return result
        }
    }
}


function update (element, data) {
    map(element._fields, (key, field) => field.update.call(element, data[key]))
    map(element.children, child => update(child, data))
}


function create_style (rules) {
    function normalize (name) {
        return name.replace( /[A-Z]/, upper => '-' + upper.toLowerCase() )
    }
    return create({ tag: 'style', textContent: '\n' + join((function* () {
        for ( let rule of rules ) {
            let selectors = rule[0].join(', ')
            let styles = join(map(
	        rule[1],
                (attr, value) => value? `${normalize(attr)}: ${value}; `: ''
            ))
	    yield styles? `${selectors} { ${styles}}\n`: ''
        }
    })()) })
}


function inject_style (name, style_tag) {
    var now = $(`style.injected_style.${name}`)
    if ( !now ) {
        now = create({ tag: 'style', classList: ['injected_style', name] })
        document.head.appendChild(now)
    }
    replace(now, style_tag)
}


function replace (now, new_element) {
  for ( let className of now.classList ) {
    new_element.classList.add(className)
  }
  now.parentNode.replaceChild(new_element, now)
  return now
}


function join (iterable, separator = '') {
  var str = ''
  var it = iterable[Symbol.iterator]()
  var a = it.next()
  var b = it.next()
  while ( !a.done ) {
    str += a.value
    if ( !b.done ) {
      str += separator
    }
    a = b
    b = it.next()
  }
  return str
}


function popup_list (pivot, get_list, f) {
    function position () {
        return {
            bottom: `calc(${pivot.offsetTop + pivot.offsetHeight}px + 0.3em)`,
            left: `${pivot.offsetLeft}px`
        }
    }
    function gen_list() {
        return filter(map(get_list(), function (x) {
            let y = f(x)
            return (typeof y != 'undefined')? create({
                tag: 'popup-item',
                dataset: y.data_item || {},
                children: [y]
            }) : null
        }), e => e !== null)
    }
    let ui = create({
        tag: 'popup',
        style: position(),
        children: gen_list()
    })
    ui.style.display = 'none'
    ui.update = function () {
        clear(ui)
        map(gen_list(), c => ui.appendChild(c))
        map(position(), (k,v) => ui.style[k] = v)
    }
    ui.toggle = function () {
        if (ui.style.display == 'none') {
            ui.update()
            map($$('popup'), x => x.style.display = 'none')
            ui.style.display = ''
        } else {
            ui.style.display = 'none'
        }
    }
    document.body.addEventListener('click', ev => ui.style.display = 'none')
    pivot.parentElement.appendChild(ui)
    return ui
}


Object.prototype.has = function (key) { return this.hasOwnProperty(key) }
HTMLAnchorElement.prototype.enable = function () { this.href = 'javascript:void(0)'; return true }
HTMLAnchorElement.prototype.disable = function () { this.removeAttribute('href'); return true }
HTMLAnchorElement.prototype.is_enabled = function () { return this.hasAttribute('href') }
HTMLTextAreaElement.prototype.enable = function () { this.disabled = false }
HTMLTextAreaElement.prototype.disable = function () { this.disabled = true }
HTMLTextAreaElement.prototype.insert = function (text) {
    let start = this.selectionStart
    let end = this.selectionEnd
    let s = (a,b) => this.value.slice(a,b)
    let len = this.value.length
    let left = s(0, start)
    left = left + ((left.endsWith(' ') || left == '')? '': ' ')
    let right = s(end, len)
    let ins = text + ((right.startsWith(' '))? '': ' ')
    this.value = `${left}${ins}${right}`
    this.selectionStart = this.selectionEnd = left.length + ins.length
    this.focus()
}
