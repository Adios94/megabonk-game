extends Node
## 全局事件总线。跨系统解耦用，避免节点互相持有引用。
## signal 由别的脚本 emit，此文件本身不 emit。

# 战斗
@warning_ignore("unused_signal")
signal damage_dealt(target_pos: Vector3, amount: float, is_crit: bool, is_player_damage: bool, is_shield: bool)
@warning_ignore("unused_signal")
signal enemy_died(enemy, killer)

# 拾取
@warning_ignore("unused_signal")
signal xp_gained(amount: int)
@warning_ignore("unused_signal")
signal level_up(new_level: int)
@warning_ignore("unused_signal")
signal pickup_collected(kind: String)

# 局内
@warning_ignore("unused_signal")
signal wave_started(wave_index: int)
@warning_ignore("unused_signal")
signal boss_spawned(boss)
