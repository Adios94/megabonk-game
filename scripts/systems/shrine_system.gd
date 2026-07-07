extends Node
## Shrine（充能神殿）系统占位。
## 旧版：SHRINE_COUNT 个圣殿散布，玩家站 SHRINE_CHARGE_DURATION 秒充能，4 选 1 永久增益。
## 现阶段：只写数据接口。

# TODO: 场景内 spawn N 个 shrine 节点
# TODO: 玩家进入半径 → 累计 charge
# TODO: 充满 → 用 ShrineRewards.roll_options 生成 4 选项 + 弹面板
# TODO: 玩家选择 → apply reward
