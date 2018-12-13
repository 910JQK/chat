const WS_URL = 'ws://127.0.0.1:8102'


var socket = null
var 名字 = ''
var 频道列表 = []
var 用户列表 = {}
var 已加入频道表 = new Set()
var 当前频道 = ''
var 滚动位置 = {}
var 占有焦点 = true
const 图片大小上限 = 3*1024*1024


function is_scrolled_to_bottom (view) {
    return view.scrollTop == (
        view.scrollTopMax || ( view.scrollHeight - view.offsetHeight )
    )
}


function scroll_to_bottom (view) {
    view.scrollTop = view.scrollTopMax || (
        view.scrollHeight - view.offsetHeight
    )
}


function get_color (str) {
    let t = 1
    let u = 0
    for ( let code of map(str, c => c.codePointAt(0)) ) {
        t *= (10*code + u) % 1e10
        u += (10*code * t) % 1e10
    }
    return `hsl(${(t+u) % 357}, ${41 + (t % 43)}%, ${13 + (u % 33)}%)`
}


function notify (title, content) {
    if ( Notification && !占有焦点 ) {
        new Notification(title, { body: content, icon: 'chat.png' })
    }
}


function 更新名字 (新名字) {
    名字 = 新名字
    名字提示.textContent = 新名字
}


function 是否提到自己 (字串) {
    return 字串.split(' ').indexOf(`@${名字}`) != -1
}


function 渲染消息 (消息视图) {
    let 滚动到最后 = is_scrolled_to_bottom(消息列表视图)    
    消息列表视图.appendChild(消息视图)
    if ( 滚动到最后 ) {
        scroll_to_bottom(消息列表视图)
    }    
}


function 渲染用户列表 () {
    列表 = 用户列表[当前频道]
    用户数量视图.textContent = `当前 ${列表.length} 人在线`
    clear(用户列表视图)
    map(列表, 名字 => 用户列表视图.appendChild(create({
        tag: 'user-item',
        style: { color: get_color(名字) },
        handlers: { click: ev => 输入框.insert(`@${名字}`) },
        textContent: 名字
    })))
}


function 清空用户列表 () {
    用户数量视图.textContent = ''
    clear(用户列表视图)
}


var 如何处理消息 = [
    {
        类型: one_of('说话'),
        执行动作: function (消息) {
            let 频道 = 消息.频道
            let 谁 = 消息.内容.谁
            let 说了什么 = 消息.内容.说了什么
            let 颜色 = get_color(谁)
            let 被提到 = (谁 != 名字) && 是否提到自己(说了什么)
            渲染消息(create({
                tag: 'message',
                dataset: {
                    频道: 频道,
                    消息类型: '说话',
                    是否高亮: 被提到
                },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})`,
                      style: { color: 颜色 } },
                    { tag: 'say-name', textContent: 谁,
                      style: { color: 颜色 },
                      handlers: { click: ev => 输入框.insert(`@${谁}`) } },
                    { tag: 'say-content', textContent: 说了什么 }
                ]
            }))
            if (被提到) {
                notify(`${频道}`, `${谁}: ${说了什么}`)
            }
            if (被提到 && 频道 != 当前频道) {
                渲染消息(create({
                    tag: 'message',
                    dataset: {
                        除去频道: 频道,
                        消息类型: '通知',
                        是否高亮: true
                    },
                    children: [
                        { tag: 'recv-time', textContent: `(${消息.收到时间})` },
                        { tag: 'info', textContent: `${谁} 在 ${频道} 提到了你` }
                    ]
                }))
            }
        }
    },
    {
        类型: one_of('发图'),
        执行动作: function (消息) {
            let 频道 = 消息.频道
            let 发图用户 = 消息.内容.谁
            let 图片 = 消息.内容.发了什么
            let 格式 = 消息.内容.什么格式
            let 颜色 = get_color(发图用户)
            let 图片地址 = URL.createObjectURL(
                new Blob([decode(图片)], {type: 'image/${格式}'})
            )
            console.log(图片地址)
            渲染消息(create({
                tag: 'message',
                dataset: {
                    频道: 频道,
                    消息类型: '发图'
                },
                children: [
                    { tag: 'recv-time', textContent: `(${消息.收到时间})`,
                      style: { color: 颜色 } },
                    { tag: 'say-name', textContent: 发图用户,
                      style: { color: 颜色 },
                      handlers: { click: ev => 输入框.insert(`@${发图用户}`) }},
                    { tag: 'img', src: 图片地址, classList: ['image'],
                      handlers: { load: (频道 == 当前频道)
                                  && is_scrolled_to_bottom(消息列表视图)
                                  && (ev => scroll_to_bottom(消息列表视图))
                                  || (ev => 0) } }
                ]
            }))
        }
    },
    {
        类型: one_of('通知', '反馈'),
        执行动作: function (消息) {
            渲染消息(create({
                tag: 'message',
                dataset: {
                    消息类型: 消息.类型,
                    频道: 消息.频道? 消息.频道: null
                },
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
            let 频道 = 消息.频道
            用户列表[频道] = 消息.内容.sort()
            if ( 频道 == 当前频道 ) {
                渲染用户列表()
            }
        }
    },
    {
        类型: one_of('名字更新'),
        执行动作: function (消息) {
            更新名字(消息.内容)
        }
    },
    {
        类型: one_of('确认'),
        执行动作: function (消息) {
            function 反馈消息视图 (文字) {
                return create({
                    tag: 'message',
                    dataset: { 消息类型: '反馈' },
                    children: [
                        { tag: 'recv-time',
                          textContent: `(${消息.收到时间})` },
                        { tag: 'info', textContent: 文字 }
                    ]
                })
            }
            if ( 消息.内容.确认什么 == '成功加入频道' ) {
                let 频道 = 消息.内容.频道
                let 主题 = 消息.内容.主题
                已加入频道表.add(频道)
                用户列表[频道] = 消息.内容.用户列表.sort()
                切换按钮.enable()
                加入按钮.更新状态()
                切换频道(频道)
                渲染消息(反馈消息视图(`已加入频道: ${频道} ~ ${主题}`))
            } else if ( 消息.内容.确认什么 == '成功退出频道' ) {
                let 频道 = 消息.内容.频道
                已加入频道表.delete(频道)
                加入按钮.更新状态()
                let l = map(已加入频道表, x=>x)
                let 退回频道 = l[l.length-1]
                切换频道(退回频道 || '')
                if (!退回频道) {
                    scroll_to_bottom(消息列表视图)
                }
                渲染消息(反馈消息视图(`已退出频道: ${频道}`))
            }
        }
    },
    {
        类型: one_of('频道列表'),
        执行动作: function (消息) {
            频道列表 = 消息.内容
            加入按钮.更新状态()
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


function 切换频道 (频道) {
    当前频道 = 频道
    频道提示.textContent = 当前频道 || '---'
    if (当前频道) {
        退出按钮.enable()
        选图按钮.enable()
        输入框.enable()
        inject_style('channel', create_style([
            [[`message[data-频道="${当前频道}"]`], { display: 'block' }],
            [[`message[data-除去频道="${当前频道}"]`], { display: 'none' }]
        ]))
        渲染用户列表()
        if ( 滚动位置[当前频道] ) {
            let r = 滚动位置[当前频道]
            if (r.滚到最后) {
                scroll_to_bottom(消息列表视图)
            } else {
                消息列表视图.scrollTop = r.数值
            }
        } else {
            scroll_to_bottom(消息列表视图)
        }
    } else {
        切换按钮.disable()
        退出按钮.disable()
        选图按钮.disable()
        输入框.disable()
        inject_style('channel', create_style([]))
        清空用户列表()
    }
}


function 说话 (说了什么) {
    发送消息({ 命令: '说话', 说了什么: 说了什么, 频道: 当前频道 })
}


function 发图 (数据, 格式) {
    发送消息({ 命令: '发图', 图片: 数据, 格式: 格式, 频道: 当前频道 })
}


function 改名 (新名字) {
    发送消息({ 命令: '改名', 新名字: 新名字 })
}


function 加入频道 (频道) {
    发送消息({ 命令: '加入频道', 频道: 频道 })
}


function 发起连接() {
    socket = new WebSocket(WS_URL)
    map(handlers, (event, handler) => socket.addEventListener(event, handler))
}


var handlers = {
    open: function (ev) {
        console.log('Connected')
        if (名字) {
            改名(名字)
            map(
                filter(已加入频道表, 频道 => 频道 != 当前频道),
                频道 => 加入频道(频道)
            )
            if (当前频道) {
                加入频道(当前频道)
            }
        }
    },
    close: function (ev) {
        console.log('Disconnected')
        function feedback (text) {
            渲染消息(create({
                tag: 'message',
                dataset: {
                    消息类型: '反馈'
                },
                children: [
                    { tag: 'info', textContent: text }
                ]
            }))
        }
        feedback('已断线, 3 秒后尝试重连')
        setTimeout(function () {
            feedback('正在尝试重连')
            发起连接()
        }, 3000)
        
    },
    message: function (ev) {
        console.log(ev.data)
        处理消息(JSON.parse(ev.data))
    }
}


function init () {
    发起连接()
    切换频道('')
    if ( Notification ) {
        Notification.requestPermission().then(function(result) {
            console.log(result);
        });
    }
    window.addEventListener('focus', ev => 占有焦点 = true)
    window.addEventListener('blur', ev => 占有焦点 = false)
    消息列表视图.addEventListener('scroll', function (ev) {
        if ( 当前频道 ) {
            滚动位置[当前频道] = {
                数值: 消息列表视图.scrollTop,
                滚到最后: is_scrolled_to_bottom(消息列表视图)
            }
        }
    })
    输入框.value = ''
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
        if (this.is_enabled()) {
            let 新名字 = prompt('请输入新的名字')
            if (新名字 != null && 新名字 != '') {
                改名(新名字)
            }
        }
    })
    选图按钮.addEventListener('click', ev => 选图对话框.toggle())
    取消选图按钮.addEventListener('click', ev => 选图对话框.hide());
    (function () {
        function feedback (text) {
            选图提示.textContent = text
        }
        let 图片数据 = ''
        let 文件格式 = 'png'
        文件输入.addEventListener('change', function (ev) {
            let f = 文件输入.files[0]
            文件格式 = f.name.replace(/.*\.(...)$/,'$1').toLowerCase()
            let reader = new FileReader()
            reader.addEventListener('load', function (ev) {
                let data = ev.target.result
                //if (2*data.length >= 图片大小上限) {
                if (data.byteLength >= 图片大小上限) {
                    feedback('文件过大, 请重新选择')
                } else {
                    feedback('图片加载成功, 点击发送键发送')
                    //图片数据 = data
                    图片数据 = encode(data)
                    发图按钮.disabled = false
                }
            });
            //reader.readAsBinaryString(f)
            reader.readAsArrayBuffer(f)
            feedback('正在加载图片...')
            发图按钮.disabled = true
        })
        发图按钮.addEventListener('click', function (ev) {
            发图按钮.disabled = true
            文件输入.value = ''
            选图对话框.hide()
            feedback('请选择要发送的图片, 最大 3M')
            发图(图片数据, 文件格式)
        })
    })()
    切换菜单 = popup_list(切换按钮, () => 已加入频道表, function (频道) {
        return create({
            tag: 'a',
            href: (频道 == 当前频道)? null: 'javascript:void(0)',
            data_item: { enabled: (频道 != 当前频道) },
            textContent: 频道,
            handlers: {
                click: ev => (频道 != 当前频道) && 切换频道(频道)
            }
        })
    })
    切换按钮.addEventListener('click', function(ev) {
        if (this.is_enabled()) {
            ev.stopPropagation()
            切换菜单.toggle()
        }
    })
    加入菜单 = popup_list(加入按钮, () => 频道列表, function (频道) {
        if (!已加入频道表.has(频道.名称)) {
            return create({
                tag: 'a',
                href: 'javascript:void(0)',
                handlers: { click: ev => 加入频道(频道.名称) },
                children: [
                    { tag: 'item-label', textContent: 频道.名称 },
                    { tag: 'item-desc', textContent: 频道.主题 }
                ]
            })
        }
    })
    加入按钮.addEventListener('click', function (ev) {
        if (this.is_enabled()) {
            ev.stopPropagation()
            加入菜单.toggle()
        }
    })
    加入按钮.更新状态 = function () {
        filter(
            map(频道列表, c => c.名称),
            名称 => !(已加入频道表.has(名称))
        ).length > 0 && 加入按钮.enable() || 加入按钮.disable()        
    }
    退出按钮.addEventListener('click', function (ev) {
        if (this.is_enabled()) {
            if (当前频道) {
                发送消息({ 命令: '退出频道', 频道: 当前频道 })
            }
        }
    })
    创建按钮.addEventListener('click', function (ev) {
        if (this.is_enabled()) {         
            let 频道名 = prompt('请输入频道名称')
            if (频道名 !== null) {
                let 主题 = prompt('请输入讨论主题')
                if (主题 !== null) {
                    发送消息({ 命令: '创建频道', 频道名: 频道名, 主题: 主题 })
                }
            }
        }
    })
}


window.addEventListener('DOMContentLoaded', init)
