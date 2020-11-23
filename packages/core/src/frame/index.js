import $FormCreate from '../components/formCreate';
import Vue from 'vue';
import makerFactory from '../factory/maker';
import Handle from '../handler';
import {creatorFactory} from '..';
import BaseParser from '../factory/parser';
import {copyRule, copyRules, parseJson} from './util';
import fragment from '../components/fragment';
import is from '@form-create/utils/lib/type';
import toCase from '@form-create/utils/lib/tocase';
import extend from '@form-create/utils/lib/extend';
import deepExtend from '@form-create/utils/lib/deepextend';
import {CreateNodeFactory} from '../factory/node';

export let _vue = typeof window !== 'undefined' && window.Vue ? window.Vue : Vue;

function _parseProp(name, id) {
    let prop;
    if (arguments.length === 2) {
        prop = arguments[1];
        id = prop[name];
    } else {
        prop = arguments[2];
    }
    return {id, prop};
}

function nameProp() {
    return _parseProp('name', ...arguments);
}

function _getEl(options) {
    if (!options || !options.el) return window.document.body;
    return is.Element(options.el)
        ? options.el
        : document.querySelector(options.el);
}

function mountForm(rules, option) {
    const $vm = new _vue({
        data() {
            //todo 外部无法修改
            return {rule: rules, option: option || {}};
        },
        render(h) {
            return h('FormCreate', {ref: 'fc', props: this.$data});
        }
    });
    $vm.$mount();
    return $vm;
}

function createParser(proto) {
    class Parser extends BaseParser {

    }

    Object.assign(Parser.prototype, proto);
    return Parser;
}

//todo 表单嵌套
export default function formCreateFactory(config) {

    const components = {
        [fragment.name]: fragment
    };
    const filters = {};
    const parsers = {};
    const directives = {};
    const providers = {};
    const maker = makerFactory();
    const globalConfig = {};
    const data = {};
    const CreateNode = CreateNodeFactory();

    function filter() {
        const data = nameProp(...arguments);
        if (data.id && data.prop) filters[data.id] = data.prop;
    }

    function directive() {
        const data = nameProp(...arguments);
        if (data.id && data.prop) directives[data.id] = data.prop;
    }

    function register() {
        const data = _parseProp('attr', ...arguments);
        if (data.id && data.prop) providers[data.id] = {...data.prop, attr: data.id};
    }

    function componentAlias(alias) {
        CreateNode.use(alias);
    }

    function parser() {
        const data = nameProp(...arguments);
        if (!data.id || !data.prop) return;
        const name = toCase(data.id);
        const parser = data.prop;
        parsers[name] = is.Function(parser) ? parser : createParser(parser);
        maker[name] = creatorFactory(name);
        parser.maker && extend(maker, parser.maker);
    }

    function component(id, component) {
        let name;
        if (is.String(id)) {
            name = toCase(id);
            if (['form-create', 'formcreate'].indexOf(name) > -1) {
                return $form();
            } else if (component === undefined) {
                return components[name];
            }
        } else {
            name = toCase(id.name);
            component = id;
        }
        if (!name || !component) return;
        components[name] = component;
        if (component.formCreateParser) parser(name, component.formCreateParser);
    }

    function $form() {
        return _vue.extend($FormCreate(FormCreate));
    }

    function create(rules, _opt, parent) {
        let $vm = mountForm(rules, _opt || {});
        const _this = $vm.$refs.fc.formCreate;
        _this.$parent = parent;
        _getEl(_this.options).appendChild($vm.$el);
        return _this.api();
    }

    //todo 检查回调函数作用域
    function use(fn) {
        if (is.Function(fn.install)) fn.install(fn, FormCreate);
        else if (is.Function(fn)) fn(FormCreate);
        return this;
    }

    function useAttr(formCreate) {
        extend(formCreate, {
            version: config.version,
            ui: config.ui,
            data,
            maker,
            component,
            filter,
            directive,
            register,
            parser,
            use,
            createParser,
            componentAlias,
            copyRule,
            copyRules,
            $form,
            parseJson
        });
    }

    function useStatic(FormCreate) {
        extend(FormCreate, {
            create,
            install(Vue, options) {
                if (options && is.Object(options))
                    deepExtend(options, globalConfig);

                if (Vue._installedFormCreate === true) return;
                Vue._installedFormCreate = true;
                _vue = Vue;

                const $formCreate = function (rules, opt = {}) {
                    return create(rules, opt, this);
                };

                useAttr($formCreate);

                Vue.prototype.$formCreate = $formCreate;
                Vue.component('FormCreate', $form());

                config.install && config.install(FormCreate, Vue, options);
            },
            init(rules, _opt = {}) {
                let $vm = mountForm(rules, _opt), _this = $vm.$refs.fc.formCreate;
                return {
                    mount($el) {
                        if ($el && is.Element($el))
                            _this.options.el = $el;
                        _getEl(_this.options).appendChild($vm.$el);
                        return _this.api();
                    },
                    remove() {
                        $vm.$el.parentNode && $vm.$el.parentNode.removeChild($vm.$el);
                    },
                    destroy() {
                        this.remove();
                        $vm.$destroy();
                    },
                    $f: _this.api()
                };
            }
        })
    }


    function FormCreate(vm, rules, options) {
        extend(this, {
            vm,
            manager: config.manager,
            parsers,
            providers,
            rules: Array.isArray(rules) ? rules : [],
            prop: {
                components,
                filters,
                directives,
            },
            CreateNode,
            bus: new _vue
        })

        this.initOptions(options || {});
        this.init();
    }

    //todo 使用事件优化流程
    extend(FormCreate.prototype, {
        init() {
            const vm = this.vm;
            vm.$on('hook:created', () => {
                this.created();
            })
            vm.$on('hook:mounted', () => {
                this.mounted();
            });
            vm.$on('hook:beforeDestroy', () => {
                this.$handle.reloadRule([]);
            });
            vm.$on('hook:updated', () => {
                this.$handle.bindNextTick(() => this.bus.$emit('next-tick', this.api()));
            });
        },
        initOptions(options) {
            this.options = deepExtend({formData: {}}, globalConfig);
            this.updateOptions(options || {});
        },
        //todo 优化 options 合并
        updateOptions(options) {
            deepExtend(this.options, options);
        },
        created() {
            this.$handle = new Handle(this);
        },
        api() {
            return this.$handle.api;
        },
        render() {
            return this.$handle.render();
        },
        mounted() {
            this.$handle.mounted();
        },
    })

    useAttr(create);
    useStatic(create);

    CreateNode.use({fragment: 'fcFragment'});

    return create;
}
