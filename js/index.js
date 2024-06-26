import IncrementalText from './incremental-text.js';
import OpenAI from './openai.js';
import {local, session} from './storage.js';
import listen from './listen.js';
import whenVoices from './voices.js';
import {$, $$} from './$.js';

const {
  SpeechSynthesisUtterance,
  requestAnimationFrame,
  speechSynthesis
} = globalThis;

let chosenVoice;
let bearer = (new URLSearchParams(window.location.search)).get('bearer') || session.get('bearer') || local.get('bearer');
let voice = local.get('voice');
let language = local.get('language');
let volume = local.get('volume');
let options = local.get('options') || {
  model: 'text-davinci-003',
  temperature: 0.2,
  max_tokens: 64
};

if (bearer)
  prepareListening(new OpenAI(bearer, options));
else {
  $('#content').innerHTML = `
  <form>
    <label>
      <span>OpenAI API Key</span>
      <input name="api-key" required>
    </label>
    <label>
      <span>Save API Key</span>
      <select name="save-key">
      <option value="no" selected>nope</option>
      <option value="session">in sessionStorage</option>
      <option value="local">in localStorage</option>
      </select>
    </label>
    <input type="submit">
  </form>
  `.trim();
  $('#content > form').on('submit', event => {
    event.preventDefault();
    const {currentTarget: form} = event;
    const fields = $$('input, select', form);
    fields.disabled = true;
    bearer = $('input[name="api-key"]', form).value.trim();
    let gpt = new OpenAI(bearer, options);
    gpt.models.then(json => {
      if (json.error) {
        fields.disabled = false;
        alert(json.error.message);
      }
      else {
        switch ($('select[name="save-key"]', form).value) {
          case 'session': session.set('bearer', bearer); break;
          case 'local': local.set('bearer', bearer); break;
        }
        $('#content').innerHTML = '';
        prepareListening(gpt);
      }
    });
  });
}

const say = (something, voice) => {
  const ssu = new SpeechSynthesisUtterance(something);
  if (voice) {
    ssu.lang = voice.lang;
    ssu.voice = voice;
  }
  if (volume != null)
    ssu.volume = volume;
  ssu.rate = 1.2;
  speechSynthesis.cancel();
  speechSynthesis.speak(ssu);
};

const showUsage = ({usage}) => {
  const {
    prompt_tokens: prompt,
    completion_tokens: completition,
    total_tokens: total
  } = usage;
  $('body').dataset.usage = `
    Tokens: prompt ${prompt} - completition ${completition} - total ${total}
  `.trim();
};

const byNameAndLang = ({name, lang}) =>
                        name === voice && lang === language;

async function prepareListening(gpt) {
  const voices = await whenVoices();
  const it = new IncrementalText($('#content').valueOf());
  const showError = ({error, message}) => {
    $('#mic').disabled = false;
    $('#mic').focus();
    it.show(`⚠️ ${error || message || 'something is wrong'}`);
  };
  chosenVoice = voices.find(byNameAndLang);
  settings(gpt, voices);
  it.show('🎙️ click the mic to ask anything');
  $('#mic')
    .on('click', ({currentTarget: button}) => {
      button.disabled = true;
      it.show('🧑 ...');
      say('', chosenVoice);
      listen(chosenVoice ? {lang: language} : void 0).then(complete, fallback);
      function complete(transcript) {
        if (transcript) {
          it.show(`🧑 “${transcript}”`, true);
          gpt.complete(transcript).then(
            result => {
              button.disabled = false;
              button.focus();
              if (result.error)
                showError(result.error);
              else {
                showUsage(result);
                for (const choice of result.choices) {
                  const images = [];
                  const text = choice.text.trim()
                    .replace(/^[?!]\s*/, '')
                    .replace(
                      /!\[(.+?)\]\((.+?)\)/,
                      (_, alt, src) => {
                        return `[${images.push({alt, src})}]`;
                      }
                    );
                  say(text, chosenVoice);
                  it.show('🤖 ' + text);
                  if (images.length) {
                    $('#content').append(document.createElement('hr'));
                    for (const details of images) {
                      const image = Object.assign(new Image, details);
                      $('#content').append(image);
                    }
                  }
                  break;
                }
              }
            },
            showError
          );
        }
        else {
          button.disabled = false;
          button.focus();
          it.show('🤷', true);
        }
      }

      function fallback({error, message}) {
        if ('service-not-allowed' !== (error || message) || !$$('#mic').length)
          showError({error, message});
        else {
          const div = document.createElement('div');
          const textarea = div.appendChild(document.createElement('textarea'));
          textarea.placeholder = 'Microphone placeholder.\nClick the robot to ask.';
          button = div.appendChild(document.createElement('button'));
          div.id = 'fallback';
          $('#mic').replaceWith(div);
          $(button)
            .on('click', () => {
              const value = textarea.value.trim();
              if (value) {
                button.disabled = true;
                textarea.value = '';
                complete(value);
              }
            })
            .textContent = '🤖';
        }
      }
    })
    .disabled = false;
}

async function settings(gpt, voices) {
  $('#settings > button').on('click', () => {
    $('body').classList.toggle('settings');
  });

  // voice & volume
  let opts = [document.createElement('option')];
  opts[0].value = 'default\x00';
  opts[0].textContent = 'OS Default';
  opts[0].selected = !voice;
  for (const {name, lang} of voices) {
    const option = document.createElement('option');
    option.value = `${name}\x00${lang}`;
    option.textContent = `${name} - ${lang}`;
    if (name === voice && lang === language)
      option.selected = true;
    opts.push(option);
  }

  $('#settings select[name="voice"]')
    .on('change', ({currentTarget: {value}}) => {
      const [name, lang] = value.split('\x00');
      if (name === 'default') {
        voice = null;
        language = null;
        chosenVoice = null;
      }
      else {
        voice = name;
        language = lang;
        chosenVoice = voices.find(byNameAndLang);
      }
      local.set('voice', voice);
      local.set('language', language);
    })
    .append(...opts)
  ;

  const $volumeBar = $('#settings input[name="volume"]')
    .on('pointermove', ({currentTarget: bar}) => {
      volume = Math.min(bar.max, Math.max(bar.min, bar.value));
      bar.value = volume;
      bar.nextElementSibling.textContent = volume;
    })
    .on('change', ({currentTarget: bar}) => {
      $(bar).emit('pointermove');
      local.set('volume', volume);
    })
  ;
  $volumeBar.value = volume;
  $volumeBar.emit('pointermove');

  // models & completition & temperature
  opts = [];
  for (const model of (await gpt.models).data) {
    const option = document.createElement('option');
    if (model.id.includes('deprecated'))
      continue;
    option.textContent = option.value = model.id;
    if (model.id === options.model)
      option.selected = true;
    opts.push(option);
  }

  $('#settings select[name="model"]')
    .on('change', ({currentTarget: {value}}) => {
      options.model = value;
      local.set('options', options);
    })
    .append(...opts)
  ;

  const $options = $$('#settings input[name="max_tokens"], #settings input[name="temperature"]')
    .on('pointermove', ({currentTarget: {nextElementSibling, value}}) => {
      nextElementSibling.textContent = value;
    })
    .on('change', ({currentTarget}) => {
      const {name, value} = currentTarget;
      if (value) {
        $(currentTarget).emit('pointermove');
        options[name] = parseFloat(value);
        local.set('options', options);
      }
    })
  ;
  for (const input of $options) {
    input.value = options[input.name];
    $(input).emit('pointermove');
  }

  const {style} = $('#settings');
  style.display = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      style.opacity = 1;
    });
  });
}
