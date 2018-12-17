#!/usr/bin/env python3


from utils import *
from peewee import *
from functools import wraps


默认频道 = '默认频道'
默认频道主题 = '自由讨论'
激活等待时间 = 25  # 分


db = SqliteDatabase('data.db')


class BaseModel(Model):
    class Meta:
        database = db


class 聊天记录(BaseModel):
    时间 = DateTimeField(index=True)
    类型 = CharField()
    频道 = TextField(index=True)
    用户 = TextField(index=True)
    内容 = TextField()


class 频道(BaseModel):
    名称 = TextField(unique=True, index=True)
    主题 = TextField()

    
class 用户(BaseModel):
    名字 = TextField(unique=True, index=True)
    邮箱 = CharField(unique=True, max_length=64, index=True)
    密码 = FixedCharField(max_length=47)
    已激活 = BooleanField(index=True)
    注册时间 = DateTimeField(index=True)
    最近登入 = DateTimeField(index=True, null=True)


class 令牌(BaseModel):
    用户 = ForeignKeyField(用户, related_name='令牌', primary_key=True)
    失效时间 = DateTimeField()
    散列值 = FixedCharField(max_length=47, index=True)


tables = [聊天记录, 频道, 用户, 令牌]


def 清除过期帐号(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        用户.delete().where(
            (用户.已激活 == False)
            & ( 用户.注册时间 < (now() - timedelta(minutes=激活等待时间+1)) )
        ).execute()
        return f(*args, **kwargs)
    return wrapped


class 数据库操作:
    
    def 写入记录(记录):
        聊天记录.create(时间=now(), **记录)
        
    def 读取记录(频道, 数量):
        return list(reversed(
            聊天记录
            .select()
            .where(聊天记录.频道 == 频道)
            .order_by(聊天记录.时间.desc())
            .paginate(1, 数量)
            .execute()
        ))
    
    def 添加频道(频道信息):
        频道.create(**频道信息)
        
    def 更改主题(频道名, 新主题):
        频道.update({频道.主题: 新主题}).where(频道.名称 == 频道名).execute()
        
    def 读取频道表():
        return list(频道.select().execute())

    @清除过期帐号
    def 名字信息(名字):
        u = first(用户.select().where(用户.名字 == 名字))
        已注册 = bool(u)
        已激活 = 已注册 and bool(u.已激活)
        return {
            '注册状态': '已注册' if 已注册 else '未注册',
            '激活状态': '已激活' if 已激活 else '未激活'
        }

    def 尝试登入(名字, 密码):
        信息 = 数据库操作.名字信息(名字)
        if 信息['注册状态'] == '未注册':
            return { '结果': '失败', '失败原因': '未注册' }
        elif 信息['激活状态'] == '未激活':
            return { '结果': '失败', '失败原因': '未激活' }
        else:
            u = 用户.get(用户.名字 == 名字)
            if u.密码 == pw_hash(名字, 密码):
                u.最近登入 = now()
                u.save()
                return { '结果': '成功' }
            else:
                return { '结果': '失败', '失败原因': '不匹配' }

    def 注册用户(名字, 邮箱, 密码):
        信息 = 数据库操作.名字信息(名字)
        if 信息['注册状态'] == '已注册':
            return { '结果': '失败', '失败原因': '已注册' }
        邮箱 = 邮箱.lower()
        if 用户.select().where(用户.邮箱 == 邮箱):
            return { '结果': '失败', '失败原因': '邮箱重复' }
        用户.create(
            名字 = 名字,
            邮箱 = 邮箱,
            密码 = pw_hash(名字, 密码),
            已激活 = False,
            注册时间 = now(),
            最近登入 = None
        )
        数据库操作.生成令牌(名字, '激活')
        return { '结果': '成功' }

    def 激活用户(名字, 令牌值):
        信息 = 数据库操作.名字信息(名字)
        if 信息['注册状态'] == '未注册':
            return False
        u = 用户.get(用户.名字 == 名字)
        if 数据库操作.检验令牌(名字, 令牌值):
            u.已激活 = True
            u.save()
            return True
        else:
            return False

    def 请求重置(名字):
        信息 = 数据库操作.名字信息(名字)
        if 信息['注册状态'] == '未注册':
            return False
        else:
            数据库操作.生成令牌(名字, '密码重置')
            return True

    def 重置密码(名字, 令牌值, 新密码):
        信息 = 数据库操作.名字信息(名字)
        if 信息['注册状态'] == '未注册':
            return False
        u = 用户.get(用户.名字 == 名字)
        if 数据库操作.检验令牌(名字, 令牌值):
            u.密码 = pw_hash(名字, 令牌值)
            return True
        else:
            return False
        
    def 生成令牌(名字, 类型):
        u = 用户.get(用户.名字 == 名字)
        令牌值 = gen_token()
        令牌.delete().where(令牌.用户 == u).execute()
        令牌.create(
            用户 = u,
            失效时间 = now() + timedelta(minutes=激活等待时间),
            散列值 = pw_hash(名字, 令牌值)
        )
        send_mail(
            to = u.邮箱,
            subject = f'聊天室: {名字} 的 {类型}令牌',
            content = f'您的令牌是: {令牌值}'
        )

    def 检验令牌(名字, 令牌值):
        u = 用户.get(用户.名字 == 名字)
        t = first(令牌.select().where(令牌.用户 == u))        
        if t and now() < t.失效时间:
            if t.散列值 == pw_hash(名字, 令牌值):
                t.失效时间 = now()
                t.save()
                return True
            else:
                return False
        else:
            return False
    
    
def init_db():
    print('Creating tables ...')
    db.create_tables(tables)
    数据库操作.添加频道({'名称': 默认频道, '主题': 默认频道主题})
    print('done.')


if __name__ == '__main__':
    init_db()
