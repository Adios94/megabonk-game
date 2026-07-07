extends Node
## Sword: 每 CD 一次 spawn 弧形 AoE，命中范围内所有敌人。projectile_count 决定弧段数。

var weapon_type: String = "sword"
var player: Node3D

var _cd_timer := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	_cd_timer -= delta * player.attack_speed_mult
	if _cd_timer > 0.0:
		return
	_cd_timer = stats["cooldown"]
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		if w["type"] == weapon_type:
			return w["level"]
	return 1


func _fire(stats: Dictionary) -> void:
	# 找玩家前方弧形范围内的敌人
	var atk_range: float = stats["range"]
	var aoe: float = stats["aoe_radius"]
	var forward := -player.global_transform.basis.z
	forward.y = 0.0
	forward = forward.normalized()

	# 优先攻击玩家前方，回退到最近
	var origin := player.global_position + forward * (atk_range * 0.5)
	var hits := WeaponUtil.find_enemies_in_radius(origin, aoe, get_tree())
	for e in hits:
		WeaponUtil.deal_damage(e, stats["damage"], player, _rng, player.global_position)

	# 视觉：一次性圆盘 flash
	_spawn_visual(origin, aoe)


func _spawn_visual(pos: Vector3, radius: float) -> void:
	var mesh := MeshInstance3D.new()
	var m := TorusMesh.new()
	m.inner_radius = radius * 0.7
	m.outer_radius = radius
	mesh.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.9, 0.4, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	mesh.rotation_degrees.x = 90.0
	get_tree().current_scene.add_child(mesh)
	mesh.global_position = pos + Vector3(0.0, 0.1, 0.0)
	var tw := get_tree().create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.2)
	tw.tween_callback(mesh.queue_free)
