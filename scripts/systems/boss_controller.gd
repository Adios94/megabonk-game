extends Node
## Boss 触发 + Altar 管理 + Overtime。
## - 开局在玩家 25~40 距离随机 spawn 一个 Altar（飞碟）
## - 玩家进入 altar 半径读条 2s → 触发 Boss spawn
## - 若 game_time >= REGULAR_GAME_DURATION 且未召唤 Boss → 进入 overtime，敌人每 10s 递增

signal overtime_started

@export var boss_scene: PackedScene
@export var altar_scene: PackedScene

var _boss_spawned: bool = false
var _altar_spawned: bool = false
var _overtime: bool = false
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	call_deferred("_spawn_altar")


func _process(_delta: float) -> void:
	if not GameManager.is_running:
		return
	# 达到常规游戏时长且未召唤 boss → overtime
	if not _boss_spawned and not _overtime and GameManager.run_seconds >= GameConfig.REGULAR_GAME_DURATION:
		_overtime = true
		overtime_started.emit()


func _spawn_altar() -> void:
	if _altar_spawned or altar_scene == null:
		return
	var player: Node3D = get_tree().get_first_node_in_group("player") as Node3D
	if player == null:
		return
	var a: float = _rng.randf() * TAU
	var r: float = _rng.randf_range(25.0, 40.0)
	var pos: Vector3 = player.global_position + Vector3(cos(a) * r, 0.0, sin(a) * r)
	pos.y = 0.5
	var altar: Node = altar_scene.instantiate()
	get_tree().current_scene.add_child(altar)
	(altar as Node3D).global_position = pos
	altar.boss_summoned.connect(_on_boss_summoned)
	_altar_spawned = true


func _on_boss_summoned(pos: Vector3) -> void:
	if _boss_spawned:
		return
	_boss_spawned = true
	if boss_scene == null:
		EventBus.boss_spawned.emit(null)
		return
	var boss: Node3D = boss_scene.instantiate() as Node3D
	get_tree().current_scene.add_child(boss)
	boss.global_position = pos
	EventBus.boss_spawned.emit(boss)


## 供敌人查询 overtime 系数
static func get_overtime_multipliers(run_seconds: float) -> Dictionary:
	if run_seconds < GameConfig.REGULAR_GAME_DURATION:
		return {"hp": 1.0, "damage": 1.0, "speed": 1.0}
	var step: int = int((run_seconds - GameConfig.REGULAR_GAME_DURATION) / 10.0)
	return {
		"hp": 1.0 + step * 0.2,
		"damage": 1.0 + step * 0.1,
		"speed": 1.0 + step * 0.05,
	}
