extends Node
## Boss 触发。BOSS_SPAWN_TIME (540s) 时在玩家前方 spawn boss。
## 未来：接入 altar 玩家读条召唤替代自动触发。

@export var boss_scene: PackedScene

var _boss_spawned: bool = false


func _process(_delta: float) -> void:
	if _boss_spawned or not GameManager.is_running:
		return
	if GameManager.run_seconds >= GameConfig.BOSS_SPAWN_TIME:
		_spawn_boss()


func _spawn_boss() -> void:
	_boss_spawned = true
	if boss_scene == null:
		push_warning("[BossController] boss_scene 未设置")
		EventBus.boss_spawned.emit(null)
		return
	var player: Node3D = get_tree().get_first_node_in_group("player") as Node3D
	if player == null:
		return
	var boss: Node3D = boss_scene.instantiate() as Node3D
	get_tree().current_scene.add_child(boss)
	# 玩家前方 8 单位
	var forward: Vector3 = -player.global_transform.basis.z
	forward.y = 0.0
	forward = forward.normalized()
	boss.global_position = player.global_position + forward * 8.0
	EventBus.boss_spawned.emit(boss)
