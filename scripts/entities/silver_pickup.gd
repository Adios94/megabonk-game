extends Node3D
## 银币拾取。玩家接触后加进 GameManager.run_silver（局内累计，结算时写入永久 silver）。

var value: int = 10
var _player: Node3D
var _lifetime: float = 60.0


func _ready() -> void:
	pass


func setup(amount: int) -> void:
	value = amount


func _process(delta: float) -> void:
	_lifetime -= delta
	if _lifetime <= 0.0:
		queue_free()
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		return

	var to_p: Vector3 = _player.global_position - global_position
	var dist: float = to_p.length()
	var attract_r: float = float(_player.pickup_radius) if _player.get("pickup_radius") != null else 2.0
	if dist < attract_r:
		var dir: Vector3 = (_player.global_position + Vector3(0.0, 0.8, 0.0) - global_position).normalized()
		global_position += dir * 12.0 * delta
	if dist < 0.9:
		_collect()


func _collect() -> void:
	GameManager.add_run_silver(value)
	queue_free()
