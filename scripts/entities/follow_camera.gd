extends Camera3D
## 第三人称固定角度俯视相机。跟随 target（默认场景内 Player 节点）位置，不吃旋转。

@export var target_path: NodePath
@export var offset := Vector3(0.0, 12.0, 12.0)   # 目标之上 12、之后 12（原版俯视 45°）
@export var follow_lerp := 8.0                    # 越大越"贴身"，0 = 硬跟

var _target: Node3D


func _ready() -> void:
	if target_path.is_empty():
		_target = get_tree().get_first_node_in_group("player") as Node3D
	else:
		_target = get_node_or_null(target_path) as Node3D
	if _target:
		global_position = _target.global_position + offset
		look_at(_target.global_position, Vector3.UP)


func _process(delta: float) -> void:
	if _target == null:
		return
	var target_pos := _target.global_position + offset
	var t := clampf(follow_lerp * delta, 0.0, 1.0)
	global_position = global_position.lerp(target_pos, t)
	look_at(_target.global_position, Vector3.UP)
