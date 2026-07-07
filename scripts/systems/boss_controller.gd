extends Node
## Boss 控制器占位。旧版 systems/bossAi.ts。
## 540s (BOSS_SPAWN_TIME) 触发 spawn；3 阶段（>60% / 30-60% / <30% HP）；7 攻击池。
## 现阶段：只有 spawn 时间检查 + 空实现。

var _boss_spawned := false


func _process(_delta: float) -> void:
	if _boss_spawned or not GameManager.is_running:
		return
	if GameManager.run_seconds >= GameConfig.BOSS_SPAWN_TIME:
		_spawn_boss()


func _spawn_boss() -> void:
	_boss_spawned = true
	# TODO: 加载 boss 场景，spawn 到玩家前方
	push_warning("[BossController] TODO spawn boss（%ds 触发但未实现）" % int(GameConfig.BOSS_SPAWN_TIME))
	EventBus.boss_spawned.emit(null)
