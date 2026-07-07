extends Node
## Flame Ring: 玩家为圆心的持续 AoE。CD 到就对范围内所有敌人结算一次伤害。

var weapon_type: String = "flame_ring"
var player: Node3D

var _cd_timer := 0.0
var _rng := RandomNumberGenerator.new()
var _visual: MeshInstance3D


func _ready() -> void:
	_rng.randomize()
	_ensure_visual()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	# 视觉半径动态跟随
	if _visual and _visual.mesh is TorusMesh:
		var m := _visual.mesh as TorusMesh
		m.inner_radius = stats["aoe_radius"] * 0.85
		m.outer_radius = stats["aoe_radius"]
		_visual.global_position = player.global_position + Vector3(0.0, 0.15, 0.0)

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
	var enemies := WeaponUtil.find_enemies_in_radius(player.global_position, stats["aoe_radius"], get_tree())
	for e in enemies:
		WeaponUtil.deal_damage(e, stats["damage"], player, _rng, player.global_position)


func _ensure_visual() -> void:
	_visual = MeshInstance3D.new()
	var m := TorusMesh.new()
	m.inner_radius = 3.0
	m.outer_radius = 3.5
	_visual.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.5, 0.15, 0.4)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_visual.material_override = mat
	_visual.rotation_degrees.x = 90.0
	call_deferred("_add_visual_to_scene")


func _add_visual_to_scene() -> void:
	get_tree().current_scene.add_child(_visual)


func _exit_tree() -> void:
	if _visual and is_instance_valid(_visual):
		_visual.queue_free()
