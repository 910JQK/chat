#!/usr/bin/env python3


from peewee import *
from datetime import datetime


默认频道 = '默认频道'
默认频道主题 = '自由讨论'


db = SqliteDatabase('data.db')


class BaseModel(Model):
    class Meta:
        database = db


class 聊天记录(BaseModel):
    时间 = DateTimeField()
    类型 = CharField()
    频道 = TextField()
    用户 = TextField()
    内容 = TextField()


class 频道(BaseModel):
    名称 = TextField(unique=True)
    主题 = TextField()


tables = [聊天记录, 频道]


class 数据库操作:
    def 写入记录(记录):
        聊天记录.create(时间=datetime.now(), **记录)
    def 读取记录(频道, 数量):
        return list(
            聊天记录
            .select()
            .where(聊天记录.频道 == 频道)
            .order_by(聊天记录.时间.desc())
            .paginate(1, 数量)
            .execute()
        )
    def 添加频道(频道信息):
        频道.create(**频道信息)
    def 更改主题(频道名, 新主题):
        频道.update({频道.主题: 新主题}).where(频道.名称 == 频道名).execute()
    def 读取频道表():
        return list(频道.select().execute())
    
    
def init_db():
    print('Creating tables ...')
    db.create_tables(tables)
    数据库操作.添加频道({'名称': 默认频道, '主题': 默认频道主题})
    print('done.')


if __name__ == '__main__':
    init_db()
