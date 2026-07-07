extends Node
## 国际化。加载 res://i18n/{zh,en}.json，提供 t(key, params) 查嵌套 dot 路径。
## 语言选择保存到 user://locale.cfg。

signal locale_changed(new_locale: String)

const LOCALE_CONFIG_PATH := "user://locale.cfg"
const DEFAULT_LOCALE := "zh"
const SUPPORTED := ["zh", "en"]

var _tables: Dictionary = {}   # locale → nested Dictionary
var _current: String = DEFAULT_LOCALE


func _ready() -> void:
	_load_all()
	_current = _load_saved_locale()


func _load_all() -> void:
	for loc in SUPPORTED:
		var loc_str: String = str(loc)
		var path: String = "res://i18n/%s.json" % loc_str
		var text: String = FileAccess.get_file_as_string(path)
		if text.is_empty():
			push_warning("[I18n] missing %s" % path)
			continue
		var parsed: Variant = JSON.parse_string(text)
		if typeof(parsed) == TYPE_DICTIONARY:
			_tables[loc_str] = parsed
		else:
			push_warning("[I18n] invalid json: %s" % path)


func _load_saved_locale() -> String:
	if not FileAccess.file_exists(LOCALE_CONFIG_PATH):
		return DEFAULT_LOCALE
	var text: String = FileAccess.get_file_as_string(LOCALE_CONFIG_PATH)
	var loc: String = text.strip_edges()
	if loc in SUPPORTED:
		return loc
	return DEFAULT_LOCALE


func get_locale() -> String:
	return _current


func set_locale(loc: String) -> void:
	if not loc in SUPPORTED or loc == _current:
		return
	_current = loc
	var f := FileAccess.open(LOCALE_CONFIG_PATH, FileAccess.WRITE)
	if f:
		f.store_string(loc)
	locale_changed.emit(loc)


## t("weapon.sword.name") 或 t("greeting.hi", {"name": "Ada"})
## 未命中键返回 key 本身（方便发现缺失）。
func t(key: String, params: Dictionary = {}) -> String:
	var value: Variant = _lookup(key, _current)
	if value == null and _current != DEFAULT_LOCALE:
		value = _lookup(key, DEFAULT_LOCALE)
	if value == null:
		return key
	var s: String = str(value)
	if not params.is_empty():
		for k in params:
			s = s.replace("{{%s}}" % k, str(params[k]))
	return s


func _lookup(key: String, loc: String) -> Variant:
	var table: Variant = _tables.get(loc, null)
	if table == null:
		return null
	var parts := key.split(".")
	var node: Variant = table
	for p in parts:
		if typeof(node) != TYPE_DICTIONARY or not (node as Dictionary).has(p):
			return null
		node = (node as Dictionary)[p]
	return node
