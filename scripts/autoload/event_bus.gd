extends Node
## 全局事件总线。跨系统解耦用，避免节点互相持有引用。

# 战斗
signal damage_dealt(source, target, amount: float, is_crit: bool)
signal enemy_died(enemy, killer)

# 拾取
signal xp_gained(amount: int)
signal level_up(new_level: int)
signal pickup_collected(kind: String)

# 局内
signal wave_started(wave_index: int)
signal boss_spawned(boss)
