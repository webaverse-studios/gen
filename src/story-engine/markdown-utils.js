const md = {
  toMarkdownString(o) {
    let s = '';
    for (const type in o) {
      const items = o[type];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (s) {
          s += '\n\n';
        }

        s += `#Type:\n${type}`;
        for (const key in item) {
          const value = item[key];
          s += `\n##${key}:\n${value}`;
        }
      }
    }
    return s;
  },
  fromMarkdownString(s) {
    const categoryStrings = s.split('\n\n');
    
    const result = {};
    for (let i = 0; i < categoryStrings.length; i++) {
      let categoryString = categoryStrings[i];

      let completionStringRemaining = categoryString;
      const readLineIndex = () => {
        const match = completionStringRemaining.match(/^([^\n]+)(\n|$)/);
        if (match) {
          const line = match[1];
          const sp = match[2];
          const deltaLength = line.length + sp.length;
          return deltaLength;
        } else {
          return -1;
        }
      };
      const readLine = () => {
        const deltaLength = readLineIndex();
        
        if (deltaLength !== -1) {
          const first = completionStringRemaining.slice(0, deltaLength);
          shiftLine(deltaLength);
          return first;
        } else {
          return null;
        }
      };
      const shiftLine = deltaLength => {
        const rest = completionStringRemaining.slice(deltaLength);
        completionStringRemaining = rest;
      };
      const labelLineRegex = /^#+([^\n]*):([^\n]*)(?:\n|$)/;

      for (;;) {
        const lineIndex = readLineIndex();
        if (lineIndex !== -1) {
          const lineString = completionStringRemaining.slice(0, lineIndex);
          completionStringRemaining = completionStringRemaining.slice(lineIndex);

          const _consumeTypeLabel = () => {
            const labelMatch = lineString.match(labelLineRegex);
            if (labelMatch) {
              const label = labelMatch[1].trim();
              if (label === 'Type') {
                const value2 = labelMatch[2].trim();

                let acc = '';
                acc += value2;
                for (;;) {
                  const lineIndex = readLineIndex();
                  if (lineIndex === -1) {
                    break;
                  } else {
                    const value3 = completionStringRemaining.slice(0, lineIndex);
                    if (labelLineRegex.test(value3)) {
                      break;
                    } else {
                      acc += value3;
                      shiftLine(lineIndex);
                      continue;
                    }
                  }
                }
                return acc.trim();
              } else {
                throw new Error(`expected type: ${lineString}`);
              }
            } else {
              throw new Error(`expected label: ${lineString}`);
            }
          };
          const type = _consumeTypeLabel();
          if (!result[type]) {
            result[type] = [];
          }

          const completionValue = {};
          result[type].push(completionValue);
          const _consumeAttributes = () => {
            for (;;) {
              const value = readLine();
              if (value !== null) {
                const labelMatch = value.match(labelLineRegex);
                if (labelMatch) {
                  const key = labelMatch[1].trim();
                  const value2 = labelMatch[2].trim();

                  let acc = '';
                  acc += value2;
                  for (;;) {
                    const lineIndex = readLineIndex();
                    if (lineIndex === -1) {
                      break;
                    } else {
                      const value3 = completionStringRemaining.slice(0, lineIndex);
                      if (labelLineRegex.test(value3)) {
                        break;
                      } else {
                        acc += value3;
                        shiftLine(lineIndex);
                        continue;
                      }
                    }
                  }
                  completionValue[key] = acc.trim();
                } else {
                  throw new Error(`expected label: ${value}`);
                }
              } else {
                break;
              }
            }
          };
          _consumeAttributes();
        } else {
          break;
        }
      }
    }
    return result;
  },
};
export default md;