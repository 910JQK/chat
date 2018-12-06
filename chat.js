const URL = 'ws://127.0.0.1:8102'


var socket


function is_scrolled_to_bottom(view) {
    return view.scrollTop == view.scrollTopMax
}


function scroll_to_bottom(view) {
    return view.scrollTop = view.scrollTopMax
}


function get_color(str) {
    let t = 1
    let u = 0
    for ( let code of map(str, c => c.codePointAt(0)) ) {
        t *= (10*code + u) % 1e10
        u += (10*code * t) % 1e10
    }
    return `hsl(${(t+u) % 357}, ${70 + (t % 23)}%, ${25 + (u % 19)}%)`
}


function 渲染消息 (消息视图) {
    let 滚动到最后 = is_scrolled_to_bottom(消息列表视图)    
    消息列表视图.appendChild(消息视图)
    if ( 滚动到最后 ) {
        scroll_to_bottom(消息列表视图)
    }    
}


var 如何处理消息 = [
    {
        类型: one_of('说话'),
        执行动作: function (消息) {
            let 谁 = 消息.内容.谁
            let 说了什么 = 消息.内容.说了什么
            let 颜色 = get_color(谁)
            渲染消息(create({
                tag: 'message',
                dataset: { 消息类型: 消息.类型 },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})`,
                      style: { color: 颜色 } },
                    { tag: 'say-name', textContent: 谁,
                      style: { color: 颜色 } },
                    { tag: 'say-content', textContent: 说了什么 }
                ]
            }))
        }
    },
    {
        类型: one_of('通知', '反馈'),
        执行动作: function (消息) {
            渲染消息(create({
                tag: 'message',
                dataset: { 消息类型: 消息.类型 },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})` },
                    { tag: 'info', textContent: 消息.内容 }
                ]
            }))
        }
    },
    {
        类型: one_of('用户列表'),
        执行动作: function (消息) {
            let 用户列表 = 消息.内容
            用户列表.sort()
            用户数量视图.textContent = `当前 ${用户列表.length} 人在线`
            clear(用户列表视图)
            map(用户列表, 名字 => 用户列表视图.appendChild(create({
                tag: 'user-item',
                textContent: 名字
            })))
        }
    }
]


function 处理消息 (消息) {
    消息.收到时间 = (new Date()).toTimeString().replace(/ .*/, '')
    for ( let 模式 of 如何处理消息 ) {
        if (模式.类型.has(消息.类型)) {
            模式.执行动作(消息)
        }
    }
}


function 发送消息 (消息) {
    socket.send(JSON.stringify(消息))
}


function 说话 (说了什么) {
    发送消息({ 命令: '说话', 说了什么: 说了什么 })
}


function 改名 (新名字) {
    发送消息({ 命令: '改名', 新名字: 新名字 })
}


var handlers = {
    open: function (ev) {
        console.log('Connected')
    },
    close: function (ev) {
        console.log('Disconnected')
    },
    message: function (ev) {
        console.log(ev.data)
        处理消息(JSON.parse(ev.data))
    }
}


function init () {
    socket = new WebSocket(URL)
    map(handlers, (event, handler) => socket.addEventListener(event, handler))
    输入框.addEventListener('keyup', function (ev) {
        if (ev.key == 'Enter') {
            let 说了什么 = 输入框.value.trimRight()
            if (说了什么) {
                说话(说了什么)
                输入框.value = ''
            }
        }
    })
    输入框.addEventListener('keypress', function (ev) {
        if (ev.key == 'Enter') {
            ev.preventDefault()
        }
    })
    改名按钮.addEventListener('click', function (ev) {
        let 新名字 = prompt('请输入新的名字')
        if (新名字 != null && 新名字 != '') {
            改名(新名字)
        }
    })
}


window.addEventListener('DOMContentLoaded', init)
