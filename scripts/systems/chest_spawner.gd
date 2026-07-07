extends Node
## 开局散布 N 个宝箱在玩家周围（距离 12~35）。

@export var chest_scene: PackedScene
@export var count: int = 10
@export var min_distance: float = 12.0
@export var max_distance: float = 35.0
@export var min_separation: float = 6.0

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	call_deferred("_spawn_all")


func _spawn_all() -> void:
	if chest_scene == null:
		return
	var player: Node3D = get_tree().get_first_node_in_group("player") as Node3D
	if player == null:
		return
	var placed: Array = []
	var tries: int = 0
	while placed.size() < count and tries < 200:
		tries += 1
		var a: float = _rng.randf() * TAU
		var r: float = _rng.randf_range(min_distance, max_distance)
		var pos: Vector3 = player.global_position + Vector3(cos(a) * r, 0.0, sin(a) * r)
		pos.y = 0.0
		# 与已放宝箱保持 min_separation
		var ok: bool = true
		for p in placed:
			if (p as Vector3).distance_to(pos) < min_separation:
				ok = false
				break
		if not ok:
			continue
		var chest: Node3D = chest_scene.instantiate() as Node3D
		get_tree().current_scene.add_child(chest)
		chest.global_position = pos
		placed.append(pos)
