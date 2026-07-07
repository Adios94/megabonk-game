extends Node
## Flame Ring: 玩家为圆心的持续 AoE。

var weapon_type: String = "flame_ring"
var player: Node3D
var sfx_key: String = ""

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
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
	var aoe: float = float(stats["aoe_radius"])
	if _visual and _visual.mesh is TorusMesh:
		var m: TorusMesh = _visual.mesh as TorusMesh
		m.inner_radius = aoe * 0.85
		m.outer_radius = aoe
		if _visual.is_inside_tree():
			_visual.global_position = player.global_position + Vector3(0.0, 0.15, 0.0)

	_cd_timer -= delta * float(player.attack_speed_mult)
	if _cd_timer > 0.0:
		return
	_cd_timer = float(stats["cooldown"])
	if sfx_key != "": Audio.play_sfx(sfx_key, 0.1)
	_fire(stats, aoe)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _fire(stats: Dictionary, aoe: float) -> void:
	var damage: float = float(stats["damage"])
	var enemies: Array = WeaponUtil.find_enemies_in_radius(player.global_position, aoe, get_tree())
	for e in enemies:
		WeaponUtil.deal_damage(e as Node, damage, player, _rng, player.global_position)


func _ensure_visual() -> void:
	_visual = MeshInstance3D.new()
	var m: TorusMesh = TorusMesh.new()
	m.inner_radius = 3.0
	m.outer_radius = 3.5
	_visual.mesh = m
	var mat: StandardMaterial3D = StandardMaterial3D.new()
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
