extends Node
## Sword: 每 CD 一次 spawn 弧形 AoE，命中范围内所有敌人。projectile_count 决定弧段数。

var weapon_type: String = "sword"
var player: Node3D

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	_cd_timer -= delta * float(player.attack_speed_mult)
	if _cd_timer > 0.0:
		return
	_cd_timer = float(stats["cooldown"])
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _fire(stats: Dictionary) -> void:
	var atk_range: float = float(stats["range"])
	var aoe: float = float(stats["aoe_radius"])
	var damage: float = float(stats["damage"])
	var forward: Vector3 = -player.global_transform.basis.z
	forward.y = 0.0
	forward = forward.normalized()

	var origin: Vector3 = player.global_position + forward * (atk_range * 0.5)
	var hits: Array = WeaponUtil.find_enemies_in_radius(origin, aoe, get_tree())
	for e in hits:
		WeaponUtil.deal_damage(e as Node, damage, player, _rng, player.global_position)

	_spawn_visual(origin, aoe)


func _spawn_visual(pos: Vector3, radius: float) -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var m: TorusMesh = TorusMesh.new()
	m.inner_radius = radius * 0.7
	m.outer_radius = radius
	mesh.mesh = m
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.9, 0.4, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	mesh.rotation_degrees.x = 90.0
	get_tree().current_scene.add_child(mesh)
	mesh.global_position = pos + Vector3(0.0, 0.1, 0.0)
	var tw: Tween = get_tree().create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.2)
	tw.tween_callback(mesh.queue_free)
