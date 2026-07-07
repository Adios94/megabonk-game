extends Node
## 敌人 spawner。M2 版本：只对应旧版 WAVE_CONFIGS[0]（0~60s 阶段），
## 每 2s 在玩家周围环带随机位置生成一只骷髅步兵，同屏上限 30。

@export var enemy_scene: PackedScene
@export var spawn_interval := 2.0
@export var max_alive := 30
@export var spawn_ring_min := 15.0
@export var spawn_ring_max := 25.0
@export var target_group := "player"

var _timer := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = spawn_interval

	var alive := get_tree().get_nodes_in_group("enemies").size()
	if alive >= max_alive:
		return

	var target := get_tree().get_first_node_in_group(target_group) as Node3D
	if target == null or enemy_scene == null:
		return

	var angle := _rng.randf() * TAU
	var radius := _rng.randf_range(spawn_ring_min, spawn_ring_max)
	var offset := Vector3(cos(angle) * radius, 0.0, sin(angle) * radius)
	var spawn_pos := target.global_position + offset
	spawn_pos.y = 1.0   # 让敌人从地面上方一点点开始，避免穿地

	var enemy := enemy_scene.instantiate() as Node3D
	get_tree().current_scene.add_child(enemy)
	enemy.global_position = spawn_pos
