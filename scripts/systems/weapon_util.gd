## 武器 behavior 通用工具。
class_name WeaponUtil
extends RefCounted


## 找场景内最近的敌人（`enemies` 组），返回节点或 null。
static func find_nearest_enemy(from: Vector3, tree: SceneTree, max_range: float = INF) -> Node3D:
	var best: Node3D = null
	var best_dist := max_range
	for e in tree.get_nodes_in_group("enemies"):
		if not (e is Node3D):
			continue
		var d: float = (e.global_position - from).length()
		if d < best_dist:
			best = e
			best_dist = d
	return best


static func find_enemies_in_radius(center: Vector3, radius: float, tree: SceneTree) -> Array:
	var out: Array = []
	var r2 := radius * radius
	for e in tree.get_nodes_in_group("enemies"):
		if not (e is Node3D):
			continue
		if (e.global_position - center).length_squared() <= r2:
			out.append(e)
	return out


## 结算一次伤害。会应用暴击 + 玩家 damage_mult。
static func deal_damage(target: Node, base_damage: float, player: Node, rng: RandomNumberGenerator, source_pos: Vector3 = Vector3.ZERO) -> void:
	if target == null or not is_instance_valid(target):
		return
	# Trait bonus（角色 passive）
	var trait_r: Dictionary = Traits.compute(player)
	var crit_ch: float = float(player.crit_chance) + float(trait_r.get("crit_chance_bonus", 0.0))
	var crit_dmg: float = float(player.crit_damage) + float(trait_r.get("crit_damage_bonus", 0.0))
	var is_crit: bool = rng.randf() < crit_ch
	var final: float = base_damage * float(player.damage_mult)
	if is_crit:
		final *= crit_dmg
	final = round(final)
	if target.has_method("take_damage"):
		target.take_damage(final, source_pos)
	# Lifesteal（Shrine + Relic）
	var lifesteal: float = float(player.shrine_lifesteal) if player.get("shrine_lifesteal") != null else 0.0
	if lifesteal > 0.0 and player.has_method("heal"):
		player.heal(final * lifesteal)
