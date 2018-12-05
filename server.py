#!/usr/bin/env python3

import sys
import json
import random
import asyncio
import websockets
from datetime import datetime
from json.decoder import JSONDecodeError


侦听端口 = 8012
服务器名称 = '服务器'
服务器 = 服务器名称
随机名字长度 = 10


用户列表 = {}


def log(text):
    print(text, file=sys.stderr)


def now():
    return datetime.now().isoformat(' ')


def 生成随机名字():
    def 尝试生成():
        大写字母 = [chr(n) for n in range(ord('A'), ord('Z'))]
        小写字母 = [chr(n) for n in range(ord('a'), ord('z'))]
        数字 = [chr(n) for n in range(ord('0'), ord('9'))]
        可用字符 = 大写字母 + 小写字母 + 数字
        return ''.join(
            [random.choice(可用字符) for i in range(0, 随机名字长度)]
        )
    名字 = 尝试生成()
    while 用户列表.get(名字):
        名字 = 尝试生成()
    return 名字


def 后台执行(操作):
    asyncio.create_task(操作)


class 用户:
    def __init__(self, socket):
        self.socket = socket
        self.登录时间 = now()
    async def 发送消息(self, 消息):
        return await self.socket.send(json.dumps(消息, ensure_ascii=False))
    async def 接收消息(self):
        字符串 = await self.socket.recv()
        try:
            return json.loads(字符串)
        except JSONDecodeError:
            return { '目标': 服务器, '内容': { '命令': '无' } }
    async def 消息队列(self):
        while True:
            yield await self.接收消息()


class 通知:
    def 广播消息(消息内容):
        for 用户 in 用户列表.values():
            后台执行(用户.发送消息({ '类型': '通知', '内容': 消息内容 }))
    def 新用户加入(名字):
        通知.广播消息(f'用户 {名字} 加入了聊天')
    def 用户退出(名字):
        通知.广播消息(f'用户 {名字} 退出了聊天')
    def 用户改名(旧名字, 新名字):
        通知.广播消息(f'用户 {旧名字} 已改名为 {新名字}')
    


def 登录用户(socket, 名字):
    新用户 = 用户(socket)
    用户列表[名字] = 新用户
    通知.新用户加入(名字)
    return 新用户


def 注销用户(socket, 名字):
    用户列表.pop(名字)
    通知.用户退出(名字)


async def 柜台(socket, url):
    def 发送(字符串):
        return socket.send(字符串)
    def 接收(字符串):
        return socket.recv()
    名字 = 生成随机名字()
    用户 = 登录用户(socket, 名字)
    欢迎消息 = f'欢迎来到聊天室! 你现在的名字是 {名字}'
    log(f'用户 {名字} 加入了聊天室')
    await 用户.发送消息({ '类型': '通知', '内容': 欢迎消息 })
    try:
        await 用户.发送消息({'类型':'用户列表', '内容':list(用户列表.keys()) })
        async for 消息 in 用户.消息队列():
            消息目标 = 消息.get('目标', 服务器)
            消息内容 = 消息.get('内容', {})
            if 消息目标 == 服务器:
                命令 = 消息内容.get('命令', '')
                if 命令 == '改名':
                    新名字 = 消息内容.get('新名字', '')
                    if 新名字:
                        if 用户列表.get(新名字):
                            重名 = f'名字 {新名字} 正在被其它人使用'
                            await 用户.发送消息({ '类型':'通知', '内容':重名 })
                        elif 新名字 == 服务器:
                            不合法 = f'名字 {新名字} 不合法'
                            await 用户.发送消息({'类型':'通知', '内容':不合法})
                        else:
                            用户列表[新名字] = 用户列表.pop(名字)
                            旧名字 = 名字
                            名字 = 新名字
                            通知.用户改名(旧名字, 新名字)
                    else:
                        缺少名字 = '请提供新的名字'
                        await 用户.发送消息({ '类型':'通知','内容': 缺少名字 })
    finally:
        注销用户(名字)


def 启动服务器():
    事件循环 = asyncio.get_event_loop()
    事件循环.run_until_complete(websockets.serve(柜台, '127.0.0.1', 侦听端口))
    事件循环.run_forever()


def main():
    if sys.version_info < (3,7):
        print('This script requires python >= 3.7')
        return
    启动服务器()


if __name__ == '__main__':
    main()
