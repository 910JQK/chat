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
        } else {
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


Object.prototype.has = function (key) { return this.hasOwnProperty(key) }
